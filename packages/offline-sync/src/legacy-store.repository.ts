import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int();
const bigintNumber = z.number().refine(Number.isInteger);
const bigint = z.union([text.regex(/^-?\d+$/u), bigintNumber]);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const jsonObject = z.record(text, z.json());
const resolution = z.enum(['device-wins', 'server-wins', 'manual-review', 'accept_server', 'reject', 'retry_after_correction', 'manual_review']);
const queueStatus = z.enum(['received', 'applied', 'conflict', 'rejected', 'pending']);
const reservationRow = z.object({
  id: uuid, tenant_id: uuid, range_id: uuid, org_unit_id: text, entity_type: text, series: text,
  agent_id: text, device_id: text, shift_id: text.nullable(), start_number: bigint,
  end_number: bigint, next_number: bigint, valid_until: timestamp,
  status: z.enum(['reserved', 'consumed', 'expired', 'cancelled', 'blocked']),
});
const rangeRow = z.object({ id: uuid, tenant_id: uuid, org_unit_id: text, entity_type: text, series: text,
  start_number: bigint, end_number: bigint, next_number: bigint, status: z.enum(['active', 'exhausted', 'cancelled']) });
const queueRow = z.object({ id: text, tenant_id: uuid, org_unit_id: text, agent_id: text, device_id: text,
  entity_type: text, local_entity_id: text, idempotency_key: text, payload_hash: text, payload_json: jsonObject,
  created_locally_at: timestamp, reserved_number: bigint.nullable(), status: queueStatus, received_at: timestamp });
const conflictRow = z.object({ id: uuid, tenant_id: uuid, sync_queue_item_id: text, local_entity_id: text,
  payload_hash: text, conflict_type: text, description: text, status: z.enum(['open', 'resolved']),
  resolution: resolution.nullable(), resolved_by: text.nullable(), resolved_at: timestamp.nullable() });
export type NumberingRangeRow = z.output<typeof rangeRow>;
export type NumberingReservationRow = z.output<typeof reservationRow>;
export type QueueItemRow = z.output<typeof queueRow>;
export type ConflictRow = z.output<typeof conflictRow>;

export const lockResolvableConflict = defineQuery({
  name: 'offline.lockResolvableConflict',
  text: sql`select q.org_unit_id,q.device_id,q.agent_id,q.device_batch_id,q.id as queue_item_id,q.idempotency_key,q.status as item_status,q.reserved_number,q.entity_type,c.local_entity_id,c.payload_hash,c.conflict_type,c.description
          from offline.sync_conflicts c
          join offline.sync_queue_items q on q.tenant_id=c.tenant_id and q.id=c.sync_queue_item_id
          where c.tenant_id=$1::uuid and c.id=$2::uuid and c.status='open' for update of c`,
  params: z.tuple([uuid, uuid]), row: z.object({ org_unit_id: text, device_id: text, agent_id: text, device_batch_id: text, queue_item_id: text, idempotency_key: text, item_status: queueStatus, reserved_number: text.nullable(), entity_type: text, local_entity_id: text, payload_hash: text, conflict_type: text, description: text }), expects: 'many',
});

export const conflictAllowedActions = defineQuery({
  name: 'offline.conflictAllowedActions',
  text: sql`select allowed_actions from offline.sync_conflict_evidence where tenant_id=$1::uuid and conflict_id=$2::uuid limit 1`,
  params: z.tuple([uuid, uuid]), row: z.object({ allowed_actions: z.array(resolution) }), expects: 'many',
});

export const appendConflictResolution = defineQuery({
  name: 'offline.appendConflictResolution',
  text: sql`insert into offline.sync_conflict_actions (tenant_id,conflict_id,action,reason,user_ref,actor_id,resulting_status,id,created_at)
        values ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$8::uuid,$9::timestamptz)`,
  params: z.tuple([uuid, uuid, resolution, text.nullable(), text.nullable(), text, z.enum(['open', 'resolved']), uuid, timestamp]), row: z.object({}), expects: 'none',
});

export const resolveConflictState = defineQuery({
  name: 'offline.resolveConflictState',
  text: sql`update offline.sync_conflicts set status='resolved',resolution=$3,
        resolution_reason=$4,resolution_user_ref=$5,resolved_by=$6,resolved_at=$7::timestamptz,
        updated_at=$7::timestamptz where tenant_id=$1::uuid and id=$2::uuid`,
  params: z.tuple([uuid, uuid, resolution, text.nullable(), text.nullable(), text, timestamp]), row: z.object({}), expects: 'none',
});

export const mergeConflictEvidence = defineQuery({
  name: 'offline.mergeConflictEvidence',
  text: sql`update offline.sync_conflict_evidence set evidence=coalesce(evidence,'{}'::jsonb) || coalesce($3::jsonb,'{}'::jsonb) ||
    case when evidence ? 'stynx' or coalesce($4::jsonb,'{}'::jsonb) <> '{}'::jsonb
      then jsonb_build_object('stynx',jsonb_build_object('version',1) || coalesce(evidence->'stynx','{}'::jsonb) || coalesce($4::jsonb,'{}'::jsonb))
      else '{}'::jsonb end
        where tenant_id=$1::uuid and conflict_id=$2::uuid returning evidence`,
  params: z.tuple([uuid, uuid, text.nullable(), text]), row: z.object({ evidence: jsonObject }), expects: 'many',
});

export const lockConflictReceipt = defineQuery({
  name: 'offline.lockConflictReceipt',
  text: sql`select status,context_json from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2 for update`,
  params: z.tuple([uuid, text]), row: z.object({ status: queueStatus, context_json: jsonObject.nullable() }), expects: 'many',
});

export const conflictRetryGuard = defineQuery({
  name: 'offline.conflictRetryGuard',
  text: sql`select exists (select 1 from offline.numbering_consumption n
          join offline.numbering_reservations r on r.tenant_id=n.tenant_id and r.id=n.reservation_id
          where n.tenant_id=$1::uuid and $3::bigint is not null and n.number=$3::bigint and n.status='applied'
            and r.device_id=$4 and r.org_unit_id=$5 and r.entity_type=$6) as applied_number,
        exists (select 1 from offline.sync_conflicts where tenant_id=$1::uuid and sync_queue_item_id=$2 and status='open' and id<>$7::uuid) as other_open`,
  params: z.tuple([uuid, text, bigint.nullable(), text, text, text, uuid]), row: z.object({ applied_number: z.boolean(), other_open: z.boolean() }), expects: 'many',
});

export const retryQueueItem = defineQuery({
  name: 'offline.retryQueueItem',
  text: sql`update offline.sync_queue_items set status='pending',updated_at=$3::timestamptz where tenant_id=$1::uuid and id=$2`,
  params: z.tuple([uuid, text, timestamp]), row: z.object({}), expects: 'none',
});

export const retryItemReceipt = defineQuery({
  name: 'offline.retryItemReceipt',
  text: sql`update offline.sync_item_receipts set status='pending',error_code=null,updated_at=$3::timestamptz where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text, timestamp]), row: z.object({}), expects: 'none',
});

export const lockLegacyReservationKey = defineQuery({
  name: 'offline.lockLegacyReservationKey',
  text: sql`select pg_advisory_xact_lock(hashtextextended($1,0))`,
  params: z.tuple([text]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'many',
});

export const lockLegacyAllocationRange = defineQuery({
  name: 'offline.lockLegacyAllocationRange',
  text: sql`select id, tenant_id, org_unit_id, entity_type, series, start_number,
                end_number, next_number, status,
                (select identity_mode from offline.sync_queue_items limit 1) as upgrade_marker
           from offline.numbering_ranges
          where tenant_id = $1::uuid
            and ($2::uuid is null or id = $2::uuid)
            and ($2::uuid is not null or (
              org_unit_id = $3
              and entity_type = $4
              and ($5::text is null or series = $5)
              and ($5::text is not null or status <> 'cancelled')
            ))
          order by series
          limit 1
          for update`,
  params: z.tuple([uuid, uuid.nullable(), text, text, text.nullable()]), row: rangeRow.extend({ upgrade_marker: z.enum(['e6', 'ctg9']).nullable() }), expects: 'many',
});

export const advanceLegacyAllocationRange = defineQuery({
  name: 'offline.advanceLegacyAllocationRange',
  text: sql`update offline.numbering_ranges
            set next_number = $3,
                status = case when $2 = end_number then 'exhausted' else status end,
                updated_at = $4::timestamptz
          where tenant_id = $1::uuid and id = $5::uuid`,
  params: z.tuple([uuid, integer, integer, timestamp, uuid]), row: z.object({}), expects: 'none',
});

export const insertLegacyReservation = defineQuery({
  name: 'offline.insertLegacyReservation',
  text: sql`insert into offline.numbering_reservations (
           id, tenant_id, range_id, org_unit_id, entity_type, series, agent_id,
           device_id, shift_id, start_number, end_number, next_number,
           reserved_at, valid_until, status
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9,
           $10, $11, $10, $12::timestamptz, $13::timestamptz, 'reserved'
         )
         returning id, tenant_id, range_id, org_unit_id, entity_type, series,
                   agent_id, device_id, shift_id, start_number, end_number,
                   next_number, valid_until, status`,
  params: z.tuple([uuid, uuid, uuid, text, text, text, text, text, text, integer, integer, timestamp, timestamp]), row: reservationRow, expects: 'many',
});

export const insertKeyedLegacyReservation = defineQuery({
  name: 'offline.insertKeyedLegacyReservation',
  text: sql`insert into offline.numbering_reservations (
           id, tenant_id, range_id, org_unit_id, entity_type, series, agent_id,
           device_id, shift_id, start_number, end_number, next_number,
           reserved_at, valid_until, status, idempotency_key, idempotency_fingerprint
         ) values (
           $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7, $8, $9,
           $10, $11, $10, $12::timestamptz, $13::timestamptz, 'reserved', $14, $15
         )
         returning id, tenant_id, range_id, org_unit_id, entity_type, series,
                   agent_id, device_id, shift_id, start_number, end_number,
                   next_number, valid_until, status`,
  params: z.tuple([uuid, uuid, uuid, text, text, text, text, text, text, integer, integer, timestamp, timestamp, text, text]), row: reservationRow, expects: 'many',
});

export const legacyReservationByKey = defineQuery({
  name: 'offline.legacyReservationByKey',
  text: sql`select id, tenant_id, range_id, org_unit_id, entity_type, series, agent_id, device_id, shift_id,
              start_number, end_number, next_number, valid_until, status, idempotency_fingerprint
         from offline.numbering_reservations where tenant_id = $1::uuid and idempotency_key = $2`,
  params: z.tuple([uuid, text]), row: reservationRow.extend({ idempotency_fingerprint: text }), expects: 'many',
});

export const lockLegacyReservation = defineQuery({
  name: 'offline.lockLegacyReservation',
  text: sql`select id, tenant_id, range_id, org_unit_id, entity_type, series,
                agent_id, device_id, shift_id, start_number, end_number,
                next_number, valid_until, status,
                (select identity_mode from offline.sync_queue_items limit 1) as upgrade_marker
           from offline.numbering_reservations
          where tenant_id = $1::uuid and id = $2::uuid
          for update`,
  params: z.tuple([uuid, uuid]), row: reservationRow.extend({ upgrade_marker: z.enum(['e6', 'ctg9']).nullable() }), expects: 'many',
});

export const cancelLegacyReservation = defineQuery({
  name: 'offline.cancelLegacyReservation',
  text: sql`update offline.numbering_reservations
            set status = 'cancelled', cancellation_reason = $3,
                cancelled_by = $4, updated_at = $5::timestamptz,
                audit_actor_id = $4
          where tenant_id = $1::uuid and id = $2::uuid
          returning id, tenant_id, range_id, org_unit_id, entity_type, series,
                    agent_id, device_id, shift_id, start_number, end_number,
                    next_number, valid_until, status`,
  params: z.tuple([uuid, uuid, text.nullable(), text, timestamp]), row: reservationRow, expects: 'many',
});

export const legacyHighestConsumption = defineQuery({
  name: 'offline.legacyHighestConsumption',
  text: sql`select max(number) as number from offline.numbering_consumption
            where tenant_id=$1::uuid and reservation_id=$2::uuid and status in ('applied','claimed-locally')`,
  params: z.tuple([uuid, uuid]), row: z.object({ number: bigint.nullable() }), expects: 'many',
});

export const reclaimLegacyReservationRange = defineQuery({
  name: 'offline.reclaimLegacyReservationRange',
  text: sql`update offline.numbering_ranges set next_number=$3,
             status=case when status='exhausted' then 'active' else status end,
             updated_at=$4::timestamptz
           where tenant_id=$1::uuid and id=$2::uuid and next_number=$5 and status<>'cancelled'`,
  params: z.tuple([uuid, uuid, integer, timestamp, integer]), row: z.object({}), expects: 'none',
});

export const insertLegacyQueueItem = defineQuery({
  name: 'offline.insertLegacyQueueItem',
  text: sql`insert into offline.sync_queue_items (
               id, tenant_id, device_batch_id, org_unit_id, agent_id, device_id,
               entity_type, local_entity_id, idempotency_key, payload_hash,
               payload_json, created_locally_at, reserved_number, status, received_at
             ) values (
               $1, $2::uuid, $3, $4, $5, $6, $7, $8, $9, $10,
               $11::jsonb, $12::timestamptz, $13, 'received', $14::timestamptz
             )
             on conflict (tenant_id, payload_hash) where identity_mode = 'e6' do nothing
             returning id, tenant_id, org_unit_id, agent_id, device_id, entity_type,
                       local_entity_id, idempotency_key, payload_hash, payload_json,
                       created_locally_at, reserved_number, status, received_at`,
  params: z.tuple([text, uuid, text, text, text, text, text, text, text, text, text, timestamp, integer.nullable(), timestamp]), row: queueRow, expects: 'many',
});

export const markLegacyQueueConflict = defineQuery({
  name: 'offline.markLegacyQueueConflict',
  text: sql`update offline.sync_queue_items
            set status = 'conflict', updated_at = $3::timestamptz
          where tenant_id = $1::uuid and id = $2 and identity_mode = 'e6'
          returning id, tenant_id, org_unit_id, agent_id, device_id, entity_type,
                    local_entity_id, idempotency_key, payload_hash, payload_json,
                    created_locally_at, reserved_number, status, received_at`,
  params: z.tuple([uuid, text, timestamp]), row: queueRow, expects: 'many',
});

export const insertLegacyConflict = defineQuery({
  name: 'offline.insertLegacyConflict',
  text: sql`insert into offline.sync_conflicts (
           id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
           conflict_type, description, status, created_at
         ) values ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, 'open', $8::timestamptz)
         returning id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
                   conflict_type, description, status, resolution, resolved_by, resolved_at`,
  params: z.tuple([uuid, uuid, text, text, text, text, text, timestamp]), row: conflictRow, expects: 'many',
});

export const lockLegacyConflict = defineQuery({
  name: 'offline.lockLegacyConflict',
  text: sql`select id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
                conflict_type, description, status, resolution, resolved_by, resolved_at,
                (select identity_mode from offline.sync_queue_items limit 1) as upgrade_marker
           from offline.sync_conflicts
          where tenant_id = $1::uuid and id = $2::uuid
          for update`,
  params: z.tuple([uuid, uuid]), row: conflictRow.extend({ upgrade_marker: z.enum(['e6', 'ctg9']).nullable() }), expects: 'many',
});

export const resolveLegacyQueueItem = defineQuery({
  name: 'offline.resolveLegacyQueueItem',
  text: sql`update offline.sync_queue_items
            set status = $3, updated_at = $4::timestamptz
          where tenant_id = $1::uuid and id = $2`,
  params: z.tuple([uuid, text, queueStatus, timestamp]), row: z.object({}), expects: 'none',
});

export const resolveLegacyConflict = defineQuery({
  name: 'offline.resolveLegacyConflict',
  text: sql`update offline.sync_conflicts
            set status = 'resolved', resolution = $3, resolved_by = $4,
                resolved_at = $5::timestamptz,
                description = coalesce($6, description), updated_at = $5::timestamptz
          where tenant_id = $1::uuid and id = $2::uuid
          returning id, tenant_id, sync_queue_item_id, local_entity_id, payload_hash,
                    conflict_type, description, status, resolution, resolved_by, resolved_at`,
  params: z.tuple([uuid, uuid, resolution, text, timestamp, text.nullable()]), row: conflictRow, expects: 'many',
});

export const legacyQueueItemByPayload = defineQuery({
  name: 'offline.legacyQueueItemByPayload',
  text: sql`select id, tenant_id, org_unit_id, agent_id, device_id, entity_type,
              local_entity_id, idempotency_key, payload_hash, payload_json,
              created_locally_at, reserved_number, status, received_at
         from offline.sync_queue_items
        where tenant_id = $1::uuid and payload_hash = $2 and identity_mode = 'e6'
        limit 1`,
  params: z.tuple([uuid, text]), row: queueRow, expects: 'many',
});
