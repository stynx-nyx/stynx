import { executeTypedQuery, executeConfiguredQuery } from '@stynx-nyx/data';
import type { StorageVerifierTransaction } from '@stynx-nyx/data';
import { renderOfflineStorage, inspectOfflineImportStorage } from './storage.js';
import { OfflineImportError } from './import-contract.js';
import type { OfflineImportOptions, OfflineImportReceipt } from './import-contract.js';
import type { OfflineImportManifest, OfflineImportRecord } from './import-schema.generated.js';
import { importOperations, importAdmission, lockImportPopulation, importLiveTargetLeases, importPriorReceipt, importOwnerClock, populateImportedScopes, insertImportReceipt, abortImportTransaction } from './import-state.repository.js';
import {
  canonicalImportJson,
  importDigest,
  importBatchIdentity,
  importInstantMicroseconds,
  validateOfflineImportManifest,
  freezeImportJson,
} from './import-validation.js';
import { importRecordCounts, readOfflineImportLedger } from './import-receipt.js';
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
function importedBytes(value: unknown): string {
  if (typeof value !== 'string') throw new TypeError('Invalid imported byte value');
  return `\\x${Buffer.from(value, 'base64').toString('hex')}`;
}
function columnValue(value: unknown, column: Column): unknown {
  if (value === null) return null;
  if (column.cast === 'bytea') {
    if (typeof value !== 'string') throw new TypeError('Invalid imported byte value');
    return Buffer.from(value, 'base64');
  }
  if (column.cast === 'json' || column.cast === 'jsonb') return canonicalImportJson(value);
  return value;
}
async function prepareRecord(
  trx: StorageVerifierTransaction,
  record: OfflineImportRecord,
  archives: OfflineImportReceipt['archives'],
): Promise<{ intended: IntendedImportRow; write: () => Promise<void> }> {
  const kind = record.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(importOperations, kind)) throw new OfflineImportError('invalid-manifest', 'record-kind');
  const operation = importOperations[kind];
  const fields = operation.fields;
  const row: Record<string, unknown> = { ...record.row };
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
  }
  const values = fields.map((column) => columnValue(row[column.source], column));
  const existing = await executeTypedQuery(trx, operation.existing, operation.existing.params.parse(values));
  const projected = Object.fromEntries(
    fields.map((column) => [
      column.target,
      column.cast === 'bytea' && row[column.source] !== null
        ? importedBytes(row[column.source])
        : row[column.source],
    ]),
  );
  const intended: IntendedImportRow = { kind: record.kind, row: projected };
  if (existing.length) {
    if (existing.length !== 1 || existing[0]?.matches !== true)
      refuse('record-conflict', record.kind);
    return { intended, write: async () => {} };
  }
  return {
    intended,
    write: async () => {
      await executeTypedQuery(trx, operation.insert, operation.insert.params.parse(values));
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
    const admission = await executeTypedQuery(trx, importAdmission, [],
    );
    if (
      admission[0]?.owner !== artifact.binding.ownerRole ||
      admission[0]?.readonly !== 'off' ||
      admission[0]?.isolation !== 'read committed'
    )
      refuse('maintenance-required', 'transaction');
    await executeTypedQuery(trx, lockImportPopulation, []);
    const inspected = await inspectOfflineImportStorage(trx, artifact);
    if (!inspected.supported) refuse('storage-unsupported', 'offline');
    const active = await executeTypedQuery(trx, importLiveTargetLeases, [],
    );
    if (active[0]?.count !== '0') refuse('maintenance-required', 'live-target-lease');
    const prior = await executeTypedQuery(trx, importPriorReceipt,
      [identity],
    );
    if (prior[0]) {
      const row = prior[0],
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
    const now = await executeTypedQuery(trx, importOwnerClock, [],
    );
    if (!now[0]) refuse('maintenance-required', 'owner-clock');
    for (const record of manifest.records)
      if (
        record.kind === 'batches' &&
        record.row.lease_expires_at !== null &&
        importInstantMicroseconds(record.row.lease_expires_at) > BigInt(now[0].us)
      )
        refuse('maintenance-required', 'live-source-lease');
    // Every mapping is checked under the whole-population lock before any record insertion.
    const tenantIds = [...new Set(manifest.records.map((record) => record.row.tenant_id))];
    for (const tenant of tenantIds) {
      const found = await executeConfiguredQuery(trx, 'offline.import-tenant-present', artifact.binding.tenantTable, [tenant]);
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
      importedBy: admission[0]!.owner,
      importedAt: now[0].at,
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
    await executeTypedQuery(trx, populateImportedScopes, []);
    await executeTypedQuery(trx, insertImportReceipt,
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
      await executeTypedQuery(trx, abortImportTransaction, []);
    } catch {
      /* Native errors already leave it aborted. */
    }
    if (error instanceof OfflineImportError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
    if (code === '42P01' || code === '42703' || code === '42883')
      refuse('storage-unsupported', 'offline');
    if (code === '23505') refuse('record-conflict', 'offline');
    if (code === '23503' || code === '23514' || code?.startsWith('STY'))
      refuse('invariant-violation', 'offline');
    if (code === '42501') refuse('maintenance-required', 'owner-privileges');
    throw error;
  }
}
