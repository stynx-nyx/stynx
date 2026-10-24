import { overlayInspectInvariantFindings, overlayInspectRangeCreationEvidence, overlayInspectReconciliationEvidence, overlayInspectReservationScopes, overlayInspectImportLedger, overlayInspectArchivedResponses, finiteInstantQueryPairs, type OfflineImportOverlayParams } from './import-overlay.repository.js';
import { executeTypedQuery, type StorageVerifierTransaction } from '@stynx-nyx/data';
import { inspectInvariantFindings, inspectRangeCreationEvidence, inspectReconciliationEvidence, inspectReservationScopes, inspectImportLedger, inspectArchivedResponses } from './storage-invariants.repository.js';
import {
  validRangeCreationEvidence,
  validReconciliationEvidence,
  bytesDigest,
  importBatchIdentity,
  importDigest,
} from './import-validation.js';
import { readOfflineImportLedger } from './import-receipt.js';

/** Only safe identities and counts leave the database; payloads and ACK bytes do not. */
export async function inspectOfflineRows(
  trx: StorageVerifierTransaction,
  overlay?: OfflineImportOverlayParams,
): Promise<readonly { tenantId?: string; finding: string; count: string }[]> {
  const result = await (overlay ? executeTypedQuery(trx, overlayInspectInvariantFindings, overlay) : executeTypedQuery(trx, inspectInvariantFindings, []));
  const findings: { tenantId?: string; finding: string; count: string }[] = [...result];
  // Every persisted instant used by a public mapper must be finite, including old unkeyed rows.
  for (const { table, query, overlayQuery } of finiteInstantQueryPairs) {
    if (overlay && !overlayQuery) throw new TypeError('Missing finite invariant overlay');
    const finiteFindings = await (overlay && overlayQuery ? executeTypedQuery(trx, overlayQuery, overlay) : executeTypedQuery(trx, query, []));
    for (const row of finiteFindings)
      findings.push({ ...row, finding: `finite-instant:${table}` });
  }
  const ranges = await (overlay ? executeTypedQuery(trx, overlayInspectRangeCreationEvidence, overlay) : executeTypedQuery(trx, inspectRangeCreationEvidence, []));
  for (const row of ranges) {
    if (!validRangeCreationEvidence(row, BigInt(row.created_us)))
      findings.push({
        tenantId: row.tenant_id,
        finding: 'range-creation-receipt-integrity',
        count: '1',
      });
  }
  const reconciliations = await (overlay ? executeTypedQuery(trx, overlayInspectReconciliationEvidence, overlay) : executeTypedQuery(trx, inspectReconciliationEvidence, []));
  for (const { start_number, end_number, ...row } of reconciliations) {
    if (start_number === null || end_number === null || !validReconciliationEvidence(row, { start_number, end_number }))
      findings.push({
        tenantId: row.tenant_id,
        finding: 'reconciliation-snapshot-integrity',
        count: '1',
      });
  }
  const scopes = await (overlay ? executeTypedQuery(trx, overlayInspectReservationScopes, overlay) : executeTypedQuery(trx, inspectReservationScopes, []));
  for (const row of scopes) {
    let valid = false;
    try {
      const shift: unknown = JSON.parse(row.shift_scope);
      valid =
        Array.isArray(shift) &&
        shift.length === 1 &&
        (shift[0] === null ||
          (typeof shift[0] === 'string' &&
            shift[0] !== 'stynx:no-shift' &&
            shift[0].length > 0 &&
            Buffer.byteLength(shift[0]) <= 255)) &&
        JSON.stringify(shift) === row.shift_scope;
    } catch {
      /* Invalid persisted machinery fails support; no repair. */
    }
    if (!valid)
      findings.push({ tenantId: row.tenant_id, finding: 'invalid-scope-fence', count: '1' });
  }
  const ledger = await (overlay ? executeTypedQuery(trx, overlayInspectImportLedger, overlay) : executeTypedQuery(trx, inspectImportLedger, []));
  const proofs = new Map<string, { body: string; headers: string }[]>();
  for (const row of ledger) {
    const receipt = readOfflineImportLedger(row);
    if (!receipt) {
      findings.push({
        finding: `import-ledger-integrity:${row.source_identity_sha256}`,
        count: '1',
      });
      continue;
    }
    for (const archive of receipt.archives)
      if (archive.verdict === 'verified') {
        const key = importBatchIdentity(archive.batch),
          prior = proofs.get(key) ?? [];
        prior.push({ body: archive.responseBodySha256!, headers: archive.responseHeadersSha256! });
        proofs.set(key, prior);
      }
  }
  const archived = await (overlay ? executeTypedQuery(trx, overlayInspectArchivedResponses, overlay) : executeTypedQuery(trx, inspectArchivedResponses, []));
  for (const row of archived) {
    const responseBody = row.response_body_bytes;
    const key = importBatchIdentity({
      tenant_id: row.tenant_id,
      device_id: row.device_id,
      device_batch_id: row.device_batch_id,
    });
    if (
      !responseBody ||
      !proofs
        .get(key)
        ?.some(
          (proof) =>
            proof.body === bytesDigest(responseBody) &&
            proof.headers === importDigest(row.response_headers),
        )
    )
      findings.push({ tenantId: row.tenant_id, finding: 'archived-response-custody', count: '1' });
  }
  return findings;
}
