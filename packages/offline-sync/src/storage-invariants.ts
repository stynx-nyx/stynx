import type { StorageVerifierTransaction } from '@stynx-nyx/data';
import {
  validRangeCreationEvidence,
  bytesDigest,
  importBatchIdentity,
  importDigest,
  type RangeCreationEvidence,
} from './import-validation';
import { readOfflineImportLedger, type OfflineImportLedgerRow } from './import-receipt';

/** Only safe identities and counts leave the database; payloads and ACK bytes do not. */
export async function inspectOfflineRows(
  trx: StorageVerifierTransaction,
): Promise<readonly { tenantId?: string; finding: string; count: string }[]> {
  const result = await trx.query<{ tenantId: string; finding: string; count: string }>(
    `with invalid as (
      select tenant_id,'range-safe-counter'::text as finding from offline.numbering_ranges
       where start_number < -9007199254740991 or end_number >= 9007199254740991
          or next_number > 9007199254740991 or start_number > end_number
          or next_number < start_number or next_number::numeric > end_number::numeric+1
      union all
      select r.tenant_id,'reservation-range-agreement' from offline.numbering_reservations r
       join offline.numbering_ranges n on n.tenant_id=r.tenant_id and n.id=r.range_id
       where r.org_unit_id<>n.org_unit_id or r.entity_type<>n.entity_type or r.series<>n.series
          or r.start_number<n.start_number or r.end_number>n.end_number or r.start_number>r.end_number
          or r.next_number<r.start_number or r.next_number::numeric>r.end_number::numeric+1
          or (r.status<>'cancelled' and n.next_number<=r.end_number)
      union all
      select a.tenant_id,'reservation-overlap' from offline.numbering_reservations a
       join offline.numbering_reservations b on a.tenant_id=b.tenant_id and a.range_id=b.range_id and a.id<b.id
       where a.status<>'cancelled' and b.status<>'cancelled'
         and a.start_number<=b.end_number and b.start_number<=a.end_number
      union all
      select tenant_id,'active-reservation-scope' from offline.numbering_reservations
       where status in ('reserved','blocked') and valid_until>statement_timestamp()
       group by tenant_id,device_id,nullif(shift_id,'stynx:no-shift')
       having count(*)>1 and bool_or(reservation_origin='ctg9')
      union all
      select r.tenant_id,'missing-active-scope-fence' from offline.numbering_reservations r
       where r.reservation_origin='ctg9' and r.status in ('reserved','blocked')
         and r.valid_until>statement_timestamp() and not exists (
           select 1 from offline.numbering_reservation_scopes s where s.tenant_id=r.tenant_id
             and s.device_id=r.device_id and s.shift_scope=jsonb_build_array(nullif(r.shift_id,'stynx:no-shift'))::text)
      union all
      select c.tenant_id,'consumption-bounds' from offline.numbering_consumption c
       join offline.numbering_reservations r on c.tenant_id=r.tenant_id and c.reservation_id=r.id
       join offline.numbering_ranges n on n.tenant_id=r.tenant_id and n.id=r.range_id
       where c.number<r.start_number or c.number>r.end_number
         or c.number < -9007199254740991 or c.number > 9007199254740991
         or (c.status in ('claimed-locally','applied') and n.next_number<=c.number)
      union all
      select a.tenant_id,'consumption-reissue' from offline.numbering_consumption a
       join offline.numbering_reservations ar on ar.tenant_id=a.tenant_id and ar.id=a.reservation_id
       join offline.numbering_consumption b on b.tenant_id=a.tenant_id and b.number=a.number and b.reservation_id>a.reservation_id
       join offline.numbering_reservations br on br.tenant_id=b.tenant_id and br.id=b.reservation_id
       where ar.range_id=br.range_id and a.status in ('claimed-locally','applied') and b.status in ('claimed-locally','applied')
      union all
      select c.tenant_id,'reservation-reissues-protected-number' from offline.numbering_consumption c
       join offline.numbering_reservations original on original.tenant_id=c.tenant_id and original.id=c.reservation_id
       join offline.numbering_reservations reusable on reusable.tenant_id=original.tenant_id
         and reusable.range_id=original.range_id and reusable.id<>original.id
       where c.status in ('claimed-locally','applied') and reusable.status<>'cancelled'
         and c.number between reusable.start_number and reusable.end_number
      union all
      select r.tenant_id,'canonical-receipt-identity' from offline.sync_item_receipts r
       left join offline.sync_queue_items q on q.tenant_id=r.tenant_id and q.id=r.queue_item_id
       where q.id is null or q.idempotency_key<>r.idempotency_key or q.payload_hash<>r.payload_hash
          or q.device_id<>r.device_id or q.device_batch_id<>r.device_batch_id
          or (q.identity_mode='ctg9' and q.status<>r.status)
      union all
      select q.tenant_id,'queue-receipt-identity' from offline.sync_queue_items q
       where q.identity_mode='ctg9' and not exists(select 1 from offline.sync_item_receipts r where r.tenant_id=q.tenant_id
         and r.queue_item_id=q.id and r.idempotency_key=q.idempotency_key and r.payload_hash=q.payload_hash)
      union all
      select q.tenant_id,'queue-number-precision' from offline.sync_queue_items q
       where q.reserved_number < -9007199254740991 or q.reserved_number > 9007199254740991
      union all
      select c.tenant_id,'conflict-canonical-identity' from offline.sync_conflicts c
       join offline.sync_queue_items q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id
       where c.payload_hash<>q.payload_hash or c.local_entity_id<>q.local_entity_id
      union all
      select e.tenant_id,'conflict-evidence-identity' from offline.sync_conflict_evidence e
       join offline.sync_conflicts c on c.tenant_id=e.tenant_id and c.id=e.conflict_id
       where e.queue_item_id<>c.sync_queue_item_id or not exists (select 1 from offline.sync_queue_items q
         where q.tenant_id=e.tenant_id and q.id=e.queue_item_id)
      union all
      select b.tenant_id,'batch-transport-identity' from offline.sync_batches b
       where (b.transport_key is null)<>(b.transport_fingerprint is null) or
         (b.transport_key is not null and not exists(select 1 from offline.sync_batch_transport_keys t
           where t.tenant_id=b.tenant_id and t.transport_key=b.transport_key and t.device_id=b.device_id
             and t.device_batch_id=b.device_batch_id and t.transport_fingerprint=b.transport_fingerprint))
      union all
      select b.tenant_id,'batch-response-state' from offline.sync_batches b
       where (b.status='closed' and (b.response_status is distinct from 201 or b.response_body_bytes is null
          or b.lease_token is not null or b.lease_expires_at is not null))
         or (b.status='open' and (b.response_status is not null or b.response_body_bytes is not null))
         or ((b.lease_token is null)<>(b.lease_expires_at is null)) or b.lease_generation<0
      union all
      select b.tenant_id,'batch-sequence-precision' from offline.sync_batches b
       where b.batch_sequence is not null and (b.batch_sequence<1 or b.batch_sequence>9007199254740991)
      union all
      select b.tenant_id,'batch-declared-keys' from offline.sync_batches b
       where jsonb_typeof(b.declared_keys)<>'array'
      union all
      select r.tenant_id,'range-administration-provenance' from offline.numbering_ranges r
       where (r.creation_key is not null and (r.created_by is null or r.creation_receipt is null
          or r.creation_fingerprint is null or jsonb_typeof(r.creation_receipt)<>'object'))
         or (r.creation_key is not null and r.status='cancelled' and (r.cancelled_by is null or r.cancelled_at is null))
    ) select tenant_id::text as "tenantId",finding,count(*)::text as count from invalid
      group by tenant_id,finding order by tenant_id,finding`,
  );
  const findings: { tenantId?: string; finding: string; count: string }[] = [...result.rows];
  // Every persisted instant used by a public mapper must be finite, including old unkeyed rows.
  const instantColumns: Record<string, readonly string[]> = {
    numbering_ranges: ['created_at', 'updated_at', 'cancelled_at'],
    numbering_reservations: ['reserved_at', 'valid_until', 'created_at', 'updated_at'],
    sync_queue_items: ['created_locally_at', 'received_at', 'created_at', 'updated_at'],
    sync_conflicts: ['resolved_at', 'created_at', 'updated_at'],
    sync_batches: ['lease_expires_at', 'created_at', 'updated_at'],
    sync_batch_transport_keys: ['created_at'],
    sync_item_receipts: ['received_at', 'updated_at'],
    sync_item_attempts: ['created_at'],
    numbering_consumption: ['finalized_at'],
    sync_conflict_evidence: ['created_at'],
    sync_conflict_actions: ['created_at'],
  };
  for (const [table, columns] of Object.entries(instantColumns)) {
    const finiteFindings = await trx.query<{ tenantId: string; count: string }>(
      `select tenant_id::text as "tenantId",count(*)::text as count from offline.${table}
        where ${columns.map((column) => `(${column} is not null and not isfinite(${column}))`).join(' or ')} group by tenant_id`,
    );
    for (const row of finiteFindings.rows)
      findings.push({ ...row, finding: `finite-instant:${table}` });
  }
  const ranges = await trx.query<
    RangeCreationEvidence & { created_us: string } & Record<string, unknown>
  >(
    `select id::text,tenant_id::text,org_unit_id,entity_type,series,start_number::text,end_number::text,
      consumer_attributes,created_by,creation_key,creation_fingerprint,creation_receipt,
      (extract(epoch from created_at)*1000000)::numeric(30,0)::text as created_us
      from offline.numbering_ranges where creation_key is not null`,
  );
  for (const row of ranges.rows) {
    if (!validRangeCreationEvidence(row, BigInt(row.created_us)))
      findings.push({
        tenantId: row.tenant_id,
        finding: 'range-creation-receipt-integrity',
        count: '1',
      });
  }
  const scopes = await trx.query<{ tenant_id: string; shift_scope: string }>(
    `select tenant_id::text,shift_scope from offline.numbering_reservation_scopes`,
  );
  for (const row of scopes.rows) {
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
  const ledger = await trx.query<OfflineImportLedgerRow & Record<string, unknown>>(
    `select source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,
      original_manifest,imported_by,(extract(epoch from imported_at)*1000000)::numeric(30,0)::text as imported_us,receipt
      from offline.sync_import_receipts`,
  );
  const proofs = new Map<string, { body: string; headers: string }[]>();
  for (const row of ledger.rows) {
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
  const archived = await trx.query<{
    tenant_id: string;
    device_id: string;
    device_batch_id: string;
    response_body_bytes: Buffer;
    response_headers: unknown;
  }>(
    `select tenant_id::text,device_id,device_batch_id,response_body_bytes,response_headers
      from offline.sync_batches where response_body_is_archived`,
  );
  for (const row of archived.rows) {
    const key = importBatchIdentity({
      tenant_id: row.tenant_id,
      device_id: row.device_id,
      device_batch_id: row.device_batch_id,
    });
    if (
      !row.response_body_bytes ||
      !proofs
        .get(key)
        ?.some(
          (proof) =>
            proof.body === bytesDigest(row.response_body_bytes) &&
            proof.headers === importDigest(row.response_headers),
        )
    )
      findings.push({ tenantId: row.tenant_id, finding: 'archived-response-custody', count: '1' });
  }
  return findings;
}
