import type { OfflineImportManifest } from './import-schema.generated';
import type { OfflineImportReceipt } from './import-contract';
import { validateArchiveAck } from './import-archive';
import {
  canonicalImportJson,
  importDigest,
  importInstantMicroseconds,
  IMPORT_RELATIONS,
  validateOfflineImportManifest,
  importBatchIdentity,
} from './import-validation';

export interface OfflineImportLedgerRow {
  source_identity_sha256: string;
  source_system: string;
  source_snapshot_id: string;
  source_sha256: string;
  manifest_sha256: string;
  mapping_sha256: string;
  original_manifest: unknown;
  imported_by: string;
  imported_us: string;
  receipt: unknown;
}
export function importRecordCounts(
  manifest: OfflineImportManifest,
): OfflineImportReceipt['recordCounts'] {
  const counts = Object.fromEntries(
    Object.keys(IMPORT_RELATIONS).map((kind) => [kind, 0]),
  ) as Record<keyof typeof IMPORT_RELATIONS, number>;
  for (const record of manifest.records) counts[record.kind]++;
  return counts;
}
function shape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(',')
  );
}
/** Validates the immutable ledger independently of caller replay arguments. */
export function readOfflineImportLedger(row: OfflineImportLedgerRow): OfflineImportReceipt | null {
  try {
    const manifest = validateOfflineImportManifest(row.original_manifest);
    for (const archive of manifest.archives) validateArchiveAck(manifest, archive);
    if (
      row.source_identity_sha256 !==
        importDigest([manifest.source.system, manifest.source.snapshotId]) ||
      row.source_system !== manifest.source.system ||
      row.source_snapshot_id !== manifest.source.snapshotId ||
      row.source_sha256 !== manifest.source.sha256 ||
      row.manifest_sha256 !== manifest.manifestSha256 ||
      row.mapping_sha256 !== importDigest(manifest.mappings)
    )
      return null;
    const receipt: unknown = JSON.parse(canonicalImportJson(row.receipt));
    if (
      !shape(receipt, [
        'source',
        'manifestSha256',
        'mappingSha256',
        'importedBy',
        'importedAt',
        'recordCounts',
        'archives',
      ]) ||
      canonicalImportJson(receipt.source) !== canonicalImportJson(manifest.source) ||
      receipt.manifestSha256 !== manifest.manifestSha256 ||
      receipt.mappingSha256 !== row.mapping_sha256 ||
      receipt.importedBy !== row.imported_by ||
      typeof receipt.importedAt !== 'string' ||
      importInstantMicroseconds(receipt.importedAt) !== BigInt(row.imported_us) ||
      canonicalImportJson(receipt.recordCounts) !==
        canonicalImportJson(importRecordCounts(manifest)) ||
      !Array.isArray(receipt.archives)
    )
      return null;
    const batches = new Map(
      manifest.records
        .filter((record) => record.kind === 'batches')
        .map((record) => [
          importBatchIdentity({
            tenant_id: record.row.tenant_id,
            device_id: record.row.device_id,
            device_batch_id: record.row.device_batch_id,
          }),
          record.row,
        ]),
    );
    const sourceArchives = new Map(
      manifest.archives.map((archive) => [importBatchIdentity(archive.batch), archive]),
    );
    const observed = new Set<string>();
    for (const archive of receipt.archives) {
      if (
        !shape(archive, [
          'batch',
          'verdict',
          'responseBodySha256',
          'responseHeadersSha256',
          'evidenceId',
        ]) ||
        !shape(archive.batch, ['tenant_id', 'device_id', 'device_batch_id'])
      )
        return null;
      const key = canonicalImportJson(archive.batch);
      if (
        !batches.has(key) ||
        observed.has(key) ||
        !['verified', 'unverified'].includes(archive.verdict as string)
      )
        return null;
      const original = sourceArchives.get(key);
      if (
        archive.responseBodySha256 !== (original?.responseBodySha256 ?? null) ||
        archive.responseHeadersSha256 !== (original?.responseHeadersSha256 ?? null)
      )
        return null;
      if (
        archive.evidenceId !== null &&
        (typeof archive.evidenceId !== 'string' ||
          !archive.evidenceId.trim() ||
          archive.evidenceId.includes('\0'))
      )
        return null;
      if (
        archive.verdict === 'verified' &&
        (!original || archive.evidenceId === null || batches.get(key)!.status === 'open')
      )
        return null;
      observed.add(key);
    }
    if (observed.size !== batches.size) return null;
    return receipt as unknown as OfflineImportReceipt;
  } catch {
    return null;
  }
}
