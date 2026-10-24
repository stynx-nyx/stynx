import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const text = z.string();
const findingRow = z.object({ tenantId: z.string(), count: z.string().regex(/^\d+$/u) });

export const finiteNumberingRanges = defineQuery({
  name: 'offline.finiteNumberingRanges',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.numbering_ranges
        where (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) or (cancelled_at is not null and not isfinite(cancelled_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteNumberingReservations = defineQuery({
  name: 'offline.finiteNumberingReservations',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.numbering_reservations
        where (reserved_at is not null and not isfinite(reserved_at)) or (valid_until is not null and not isfinite(valid_until)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncQueueItems = defineQuery({
  name: 'offline.finiteSyncQueueItems',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_queue_items
        where (created_locally_at is not null and not isfinite(created_locally_at)) or (received_at is not null and not isfinite(received_at)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncConflicts = defineQuery({
  name: 'offline.finiteSyncConflicts',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_conflicts
        where (resolved_at is not null and not isfinite(resolved_at)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncBatches = defineQuery({
  name: 'offline.finiteSyncBatches',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_batches
        where (lease_expires_at is not null and not isfinite(lease_expires_at)) or (created_at is not null and not isfinite(created_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncBatchTransportKeys = defineQuery({
  name: 'offline.finiteSyncBatchTransportKeys',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_batch_transport_keys
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncItemReceipts = defineQuery({
  name: 'offline.finiteSyncItemReceipts',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_item_receipts
        where (received_at is not null and not isfinite(received_at)) or (updated_at is not null and not isfinite(updated_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncItemAttempts = defineQuery({
  name: 'offline.finiteSyncItemAttempts',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_item_attempts
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteNumberingConsumption = defineQuery({
  name: 'offline.finiteNumberingConsumption',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.numbering_consumption
        where (finalized_at is not null and not isfinite(finalized_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncConflictEvidence = defineQuery({
  name: 'offline.finiteSyncConflictEvidence',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_conflict_evidence
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteSyncConflictActions = defineQuery({
  name: 'offline.finiteSyncConflictActions',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.sync_conflict_actions
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteNumberingReconciliations = defineQuery({
  name: 'offline.finiteNumberingReconciliations',
  text: sql`select tenant_id::text as "tenantId",count(*)::text as count from offline.numbering_reconciliations
        where (created_at is not null and not isfinite(created_at)) group by tenant_id`,
  params: z.tuple([]), row: findingRow, expects: 'many',
});

export const finiteInstantQueries = [
  { table: 'numbering_ranges', query: finiteNumberingRanges },
  { table: 'numbering_reservations', query: finiteNumberingReservations },
  { table: 'sync_queue_items', query: finiteSyncQueueItems },
  { table: 'sync_conflicts', query: finiteSyncConflicts },
  { table: 'sync_batches', query: finiteSyncBatches },
  { table: 'sync_batch_transport_keys', query: finiteSyncBatchTransportKeys },
  { table: 'sync_item_receipts', query: finiteSyncItemReceipts },
  { table: 'sync_item_attempts', query: finiteSyncItemAttempts },
  { table: 'numbering_consumption', query: finiteNumberingConsumption },
  { table: 'sync_conflict_evidence', query: finiteSyncConflictEvidence },
  { table: 'sync_conflict_actions', query: finiteSyncConflictActions },
  { table: 'numbering_reconciliations', query: finiteNumberingReconciliations },
] as const;

// These envelopes retain evidence payloads for the existing integrity validators.
// The diagnostic reader must report corrupt evidence rather than normalize it away.

export const inspectInvariantFindings = defineQuery({
  name: 'offline.inspectInvariantFindings',
  text: sql`with invalid as (
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
  params: z.tuple([]), row: findingRow.extend({ finding: z.string() }), expects: 'many',
});

export const inspectRangeCreationEvidence = defineQuery({
  name: 'offline.inspectRangeCreationEvidence',
  text: sql`select id::text,tenant_id::text,org_unit_id,entity_type,series,start_number::text,end_number::text,
      consumer_attributes,created_by,creation_key,creation_fingerprint,creation_receipt,
      (extract(epoch from created_at)*1000000)::numeric(30,0)::text as created_us
      from offline.numbering_ranges where creation_key is not null`,
  params: z.tuple([]), row: z.object({ id: text, tenant_id: text, org_unit_id: text, entity_type: text, series: text, start_number: text, end_number: text, consumer_attributes: z.json(), created_by: text.nullable(), creation_key: text.nullable(), creation_fingerprint: text.nullable(), creation_receipt: z.json(), created_us: text.regex(/^-?\d+$/u) }), expects: 'many',
});

export const inspectReconciliationEvidence = defineQuery({
  name: 'offline.inspectReconciliationEvidence',
  text: sql`select h.id::text,h.tenant_id::text,h.reservation_id::text,h.actor_id,
      to_char(h.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      h.claimed_numbers,h.user_ref,h.idempotency_key,h.request_fingerprint,h.result_json,
      r.start_number::text,r.end_number::text from offline.numbering_reconciliations h
      left join offline.numbering_reservations r on r.tenant_id=h.tenant_id and r.id=h.reservation_id`,
  params: z.tuple([]), row: z.object({ id: text, tenant_id: text, reservation_id: text, actor_id: text, created_at: text.nullable(), claimed_numbers: z.json(), user_ref: text.nullable(), idempotency_key: text.nullable(), request_fingerprint: text.nullable(), result_json: z.json(), start_number: text.nullable(), end_number: text.nullable() }), expects: 'many',
});

export const inspectReservationScopes = defineQuery({
  name: 'offline.inspectReservationScopes',
  text: sql`select tenant_id::text,shift_scope from offline.numbering_reservation_scopes`,
  params: z.tuple([]), row: z.object({ tenant_id: text, shift_scope: text }), expects: 'many',
});

export const inspectImportLedger = defineQuery({
  name: 'offline.inspectImportLedger',
  text: sql`select source_identity_sha256,source_system,source_snapshot_id,source_sha256,manifest_sha256,mapping_sha256,
      original_manifest,imported_by,(extract(epoch from imported_at)*1000000)::numeric(30,0)::text as imported_us,receipt
      from offline.sync_import_receipts`,
  params: z.tuple([]), row: z.object({ source_identity_sha256: text, source_system: text, source_snapshot_id: text, source_sha256: text, manifest_sha256: text, mapping_sha256: text, original_manifest: z.json(), imported_by: text, imported_us: text.regex(/^-?\d+$/u), receipt: z.json() }), expects: 'many',
});

export const inspectArchivedResponses = defineQuery({
  name: 'offline.inspectArchivedResponses',
  text: sql`select tenant_id::text,device_id,device_batch_id,response_body_bytes,response_headers
      from offline.sync_batches where response_body_is_archived`,
  params: z.tuple([]), row: z.object({ tenant_id: text, device_id: text, device_batch_id: text, response_body_bytes: z.instanceof(Buffer).nullable(), response_headers: z.json() }), expects: 'many',
});
