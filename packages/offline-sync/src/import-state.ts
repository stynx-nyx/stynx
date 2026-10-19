import { quoteStorageIdentifier } from '@stynx-nyx/data';
import type { StorageVerifierTransaction } from '@stynx-nyx/data';
import { renderOfflineStorage, inspectOfflineImportStorage } from './storage.js';
import { OfflineImportError } from './import-contract.js';
import type { OfflineImportOptions, OfflineImportReceipt } from './import-contract.js';
import type { OfflineImportManifest, OfflineImportRecord } from './import-schema.generated.js';
import { OFFLINE_IMPORT_SCHEMA } from './import-schema.generated.js';
import {
  IMPORT_RELATIONS,
  IMPORT_KEYS,
  canonicalImportJson,
  importDigest,
  importBatchIdentity,
  importInstantMicroseconds,
  validateOfflineImportManifest,
  freezeImportJson,
} from './import-validation.js';
import { importRecordCounts, readOfflineImportLedger } from './import-receipt.js';
import type { OfflineImportLedgerRow } from './import-receipt.js';
import { verifyImportArchives } from './import-archive.js';
import { preflightOfflineImport, type IntendedImportRow } from './import-preflight.js';

const ORDER: readonly OfflineImportRecord['kind'][] = [
  'ranges',
  'reservations',
  'batches',
  'queueItems',
  'conflicts',
  'transportKeys',
  'receipts',
  'attempts',
  'consumption',
  'conflictEvidence',
  'conflictActions',
  'reconciliations',
];
const LOCK_RELATIONS = [
  ...Object.values(IMPORT_RELATIONS),
  'numbering_reservation_scopes',
  'sync_import_receipts',
].sort();
function refuse(
  reason: ConstructorParameters<typeof OfflineImportError>[0],
  object: string,
): never {
  throw new OfflineImportError(reason, object);
}
interface Column {
  source: string;
  target: string;
  cast: string;
}
function columns(kind: OfflineImportRecord['kind']): Column[] {
  const definitions = OFFLINE_IMPORT_SCHEMA.$defs as unknown as Record<
    string,
    {
      properties: Record<
        string,
        { $ref?: string; type?: unknown; anyOf?: readonly { $ref?: string }[] }
      >;
    }
  >;
  return Object.entries(definitions[`${kind}Row`]!.properties).map(([source, rule]) => {
    const refs = [rule.$ref, ...(rule.anyOf ?? []).map((item) => item.$ref)];
    const cast =
      source === 'claimed_numbers'
        ? 'bigint[]'
        : source === 'result_json'
          ? 'jsonb'
          : source === 'response_body_base64'
            ? 'bytea'
            : refs.includes('#/$defs/uuid')
              ? 'uuid'
              : refs.includes('#/$defs/bigint')
                ? 'bigint'
                : refs.includes('#/$defs/instant')
                  ? 'timestamptz'
                  : refs.some((ref) => ['#/$defs/object', '#/$defs/headers'].includes(ref ?? '')) ||
                      rule.type === 'array'
                    ? source === 'consumer_attributes'
                      ? 'json'
                      : 'jsonb'
                    : source === 'response_status'
                      ? 'integer'
                      : 'text';
    return {
      source,
      target: source === 'response_body_base64' ? 'response_body_bytes' : source,
      cast,
    };
  });
}
function columnValue(value: unknown, column: Column): unknown {
  if (value === null) return null;
  if (column.cast === 'bytea') return Buffer.from(value as string, 'base64');
  if (column.cast === 'json' || column.cast === 'jsonb') return canonicalImportJson(value);
  return value;
}
async function prepareRecord(
  trx: StorageVerifierTransaction,
  record: OfflineImportRecord,
  archives: OfflineImportReceipt['archives'],
): Promise<{ intended: IntendedImportRow; write: () => Promise<void> }> {
  const relation = `offline.${quoteStorageIdentifier(IMPORT_RELATIONS[record.kind])}`;
  const fields = columns(record.kind);
  const row = { ...record.row } as Record<string, unknown>;
  if (record.kind === 'batches') {
    const key = importBatchIdentity({
      tenant_id: record.row.tenant_id,
      device_id: record.row.device_id,
      device_batch_id: record.row.device_batch_id,
    });
    const verified =
      archives.find((archive) => importBatchIdentity(archive.batch) === key)?.verdict ===
      'verified';
    if (row.status !== 'open') row.status = verified ? 'closed' : 'legacy_closed_unverified';
    row.response_body_is_archived = verified;
    fields.push({
      source: 'response_body_is_archived',
      target: 'response_body_is_archived',
      cast: 'boolean',
    });
  }
  const values = fields.map((column) => columnValue(row[column.source], column));
  const parameters = fields.map((column, index) => `$${index + 1}::${column.cast}`);
  const keys = IMPORT_KEYS[record.kind];
  const predicate = keys
    .map((key) => {
      const index = fields.findIndex((column) => column.source === key);
      return `${quoteStorageIdentifier(key)}=${parameters[index]}`;
    })
    .join(' and ');
  const equality = fields
    .map(
      (column, index) =>
        `${quoteStorageIdentifier(column.target)}${column.cast === 'json' ? '::jsonb' : ''} is not distinct from ${parameters[index]}${column.cast === 'json' ? '::jsonb' : ''}`,
    )
    .join(' and ');
  const existing = await trx.query<{ matches: boolean }>(
    `select (${equality}) as matches from ${relation} where ${predicate}`,
    values,
  );
  const projected = Object.fromEntries(
    fields.map((column) => [
      column.target,
      column.cast === 'bytea' && row[column.source] !== null
        ? `\\x${Buffer.from(row[column.source] as string, 'base64').toString('hex')}`
        : row[column.source],
    ]),
  );
  const intended: IntendedImportRow = { kind: record.kind, row: projected };
  if (existing.rows.length) {
    if (existing.rows.length !== 1 || existing.rows[0]?.matches !== true)
      refuse('record-conflict', record.kind);
    return { intended, write: async () => {} };
  }
  return {
    intended,
    write: async () => {
      await trx.query(
        `insert into ${relation} (${fields.map((column) => quoteStorageIdentifier(column.target)).join(',')}) values (${parameters.join(',')})`,
        values,
      );
    },
  };
}

/** Owner-only, caller-transaction atomic import. No domain applier, event or provider invocation. */
export async function importOfflineState(
  trx: StorageVerifierTransaction,
  input: OfflineImportManifest,
  options: OfflineImportOptions = {},
): Promise<OfflineImportReceipt> {
  if (
    !options ||
    typeof options !== 'object' ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => !['storage', 'verifyArchive'].includes(key)) ||
    (options.verifyArchive !== undefined &&
      (!options.verifyArchive || typeof options.verifyArchive.verify !== 'function'))
  )
    refuse('invalid-manifest', 'options');
  const manifest = freezeImportJson(validateOfflineImportManifest(input));
  let artifact: ReturnType<typeof renderOfflineStorage>;
  try {
    artifact = renderOfflineStorage(options.storage);
  } catch {
    return refuse('invalid-manifest', 'storage-options');
  }
  const mappingSha256 = importDigest(manifest.mappings),
    identity = importDigest([manifest.source.system, manifest.source.snapshotId]);
  try {
    const admission = await trx.query<{ owner: string; readonly: string; isolation: string }>(
      `select current_user::text as owner,current_setting('transaction_read_only') as readonly,current_setting('transaction_isolation') as isolation`,
    );
    if (
      admission.rows[0]?.owner !== artifact.binding.ownerRole ||
      admission.rows[0]?.readonly !== 'off' ||
      admission.rows[0]?.isolation !== 'read committed'
    )
      refuse('maintenance-required', 'transaction');
    await trx.query(
      `lock table ${LOCK_RELATIONS.map((name) => `offline.${quoteStorageIdentifier(name)}`).join(',')} in access exclusive mode`,
    );
    const inspected = await inspectOfflineImportStorage(trx, artifact);
    if (!inspected.supported) refuse('storage-unsupported', 'offline');
    const active = await trx.query<{ count: string }>(
      `select count(*)::text as count from offline.sync_batches where lease_token is not null and lease_expires_at>clock_timestamp()`,
    );
    if (active.rows[0]?.count !== '0') refuse('maintenance-required', 'live-target-lease');
    const prior = await trx.query<OfflineImportLedgerRow & Record<string, unknown>>(
      `select source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,
       original_manifest,imported_by,(extract(epoch from imported_at)*1000000)::numeric(30,0)::text as imported_us,receipt
       from offline.sync_import_receipts where source_identity_sha256=$1`,
      [identity],
    );
    if (prior.rows[0]) {
      const row = prior.rows[0],
        receipt = readOfflineImportLedger(row);
      if (!receipt) refuse('invariant-violation', 'import-receipt');
      if (
        row.source_system !== manifest.source.system ||
        row.source_snapshot_id !== manifest.source.snapshotId ||
        row.source_sha256 !== manifest.source.sha256 ||
        row.manifest_sha256 !== manifest.manifestSha256 ||
        row.mapping_sha256 !== mappingSha256 ||
        canonicalImportJson(row.original_manifest) !== canonicalImportJson(manifest)
      )
        refuse('source-conflict', 'source-identity');
      return receipt;
    }
    const now = await trx.query<{ at: string; us: string }>(
      `select to_char(at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as at,
        (extract(epoch from at)*1000000)::numeric(30,0)::text as us from (select clock_timestamp() as at) observation`,
    );
    if (!now.rows[0]) refuse('maintenance-required', 'owner-clock');
    for (const record of manifest.records)
      if (
        record.kind === 'batches' &&
        record.row.lease_expires_at !== null &&
        importInstantMicroseconds(record.row.lease_expires_at) > BigInt(now.rows[0].us)
      )
        refuse('maintenance-required', 'live-source-lease');
    // Every mapping is checked under the whole-population lock before any record insertion.
    const tenantIds = [...new Set(manifest.records.map((record) => record.row.tenant_id))];
    const tenantTable = `${quoteStorageIdentifier(artifact.binding.tenantTable.schema)}.${quoteStorageIdentifier(artifact.binding.tenantTable.table)}`;
    for (const tenant of tenantIds) {
      const found = await trx.query<{ present: boolean }>(
        `select exists(select 1 from ${tenantTable} where ${quoteStorageIdentifier(artifact.binding.tenantTable.column)}=$1::uuid) as present`,
        [tenant],
      );
      if (found.rows[0]?.present !== true) refuse('record-conflict', 'tenant');
    }
    const archives = await verifyImportArchives(manifest, options.verifyArchive);
    const prepared: Awaited<ReturnType<typeof prepareRecord>>[] = [];
    for (const kind of ORDER)
      for (const record of manifest.records)
        if (record.kind === kind) prepared.push(await prepareRecord(trx, record, archives));
    const receipt: OfflineImportReceipt = {
      source: manifest.source,
      manifestSha256: manifest.manifestSha256,
      mappingSha256,
      importedBy: admission.rows[0]!.owner,
      importedAt: now.rows[0].at,
      recordCounts: importRecordCounts(manifest),
      archives,
    };
    const ledger = {
      source_identity_sha256: identity,
      source_system: manifest.source.system,
      source_snapshot_id: manifest.source.snapshotId,
      source_sha256: manifest.source.sha256,
      manifest_sha256: manifest.manifestSha256,
      mapping_sha256: mappingSha256,
      original_manifest: manifest,
      imported_by: receipt.importedBy,
      imported_at: receipt.importedAt,
      receipt,
    };
    await preflightOfflineImport(
      trx,
      prepared.map((value) => value.intended),
      ledger,
      artifact.manifest.catalog,
    );
    for (const row of prepared) await row.write();
    await trx.query(`insert into offline.numbering_reservation_scopes (tenant_id,device_id,shift_scope,generation)
      select tenant_id,device_id,shift_scope,gen_random_uuid() from (
        select distinct tenant_id,device_id,jsonb_build_array(nullif(shift_id,'stynx:no-shift'))::text as shift_scope
        from offline.numbering_reservations) missing
      on conflict (tenant_id,device_id,shift_scope) do nothing`);
    await trx.query(
      `insert into offline.sync_import_receipts
      (source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,original_manifest,imported_by,imported_at,receipt)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz,$10::jsonb)`,
      [
        identity,
        manifest.source.system,
        manifest.source.snapshotId,
        manifest.source.sha256,
        manifest.manifestSha256,
        mappingSha256,
        canonicalImportJson(manifest),
        receipt.importedBy,
        receipt.importedAt,
        canonicalImportJson(receipt),
      ],
    );
    const final = await inspectOfflineImportStorage(trx, artifact);
    if (!final.supported) refuse('invariant-violation', 'imported-state');
    return receipt;
  } catch (error) {
    // Pure preflight/refusal errors must also make a caller's accidental COMMIT impossible.
    // This fixed statement aborts the supplied transaction without owning its rollback lifecycle.
    try {
      await trx.query('select 1 / 0');
    } catch {
      /* Native errors already leave it aborted. */
    }
    if (error instanceof OfflineImportError) throw error;
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === '42703' || code === '42883')
      refuse('storage-unsupported', 'offline');
    if (code === '23505') refuse('record-conflict', 'offline');
    if (code === '23503' || code === '23514' || code?.startsWith('STY'))
      refuse('invariant-violation', 'offline');
    if (code === '42501') refuse('maintenance-required', 'owner-privileges');
    throw error;
  }
}
