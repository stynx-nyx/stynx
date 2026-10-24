import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int();
const bigint = z.union([text.regex(/^-?\d+$/u), z.number().refine(Number.isInteger)]);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const jsonObject = z.record(text, z.json());
const queueStatus = z.enum(['received', 'applied', 'conflict', 'rejected', 'pending']);
const reservationStatus = z.enum(['reserved', 'consumed', 'expired', 'cancelled', 'blocked']);
const batchRow = z.object({
  response_body_is_archived: z.boolean().optional(), initial_queue_status: z.enum(['received', 'pending']).optional(),
  device_id: text, device_batch_id: text, batch_sequence: bigint.nullable(),
  status: z.enum(['open', 'closed', 'legacy_closed_unverified']), context_hash: text, declared_keys: z.array(text.nullable()),
  lease_token: uuid.nullable(), lease_generation: bigint, lease_expires_at: timestamp.nullable(),
  response_status: integer.min(-2147483648).max(2147483647).nullable(), response_body_bytes: z.instanceof(Buffer).nullable(),
  response_headers: z.record(text, text).nullable(), transport_key: text.nullable(), transport_fingerprint: text.nullable(),
  lease_valid: z.boolean().nullable().optional(),
});
const receiptRow = z.object({ idempotency_key: text, queue_item_id: text, payload_hash: text,
  status: queueStatus, error_code: text.nullable(), context_json: jsonObject.nullable() });
const reservationRow = z.object({ id: uuid, tenant_id: uuid, range_id: uuid, org_unit_id: text, entity_type: text,
  series: text, agent_id: text, device_id: text, shift_id: text.nullable(), start_number: bigint, end_number: bigint,
  next_number: bigint, valid_until: timestamp, status: reservationStatus, expired: z.boolean().optional() });

export const readDurableBatch = defineQuery({
  name: 'offline.readDurableBatch',
  text: sql`select *,lease_expires_at > clock_timestamp() as lease_valid from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3`,
  params: z.tuple([uuid, text, text]), row: batchRow, expects: 'many',
});

export const renewDurableLease = defineQuery({
  name: 'offline.renewDurableLease',
  text: sql`update offline.sync_batches set lease_expires_at=clock_timestamp()+interval '30 seconds'
    where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and status='open'
      and lease_token=$4::uuid and lease_generation=$5 returning lease_generation`,
  params: z.tuple([uuid, text, text, uuid, integer]), row: z.object({ lease_generation: bigint }), expects: 'many',
});

export const insertTransportKey = defineQuery({
  name: 'offline.insertTransportKey',
  text: sql`insert into offline.sync_batch_transport_keys
    (tenant_id,transport_key,device_id,device_batch_id,transport_fingerprint)
    values ($1::uuid,$2,$3,$4,$5) on conflict (tenant_id,transport_key) do nothing`,
  params: z.tuple([uuid, text, text, text, text]), row: z.object({}), expects: 'none',
});

export const boundTransportKey = defineQuery({
  name: 'offline.boundTransportKey',
  text: sql`select device_id,device_batch_id,transport_fingerprint from offline.sync_batch_transport_keys
      where tenant_id=$1::uuid and transport_key=$2`,
  params: z.tuple([uuid, text]), row: z.object({ device_id: text, device_batch_id: text, transport_fingerprint: text }), expects: 'many',
});

export const durableItemReceipts = defineQuery({
  name: 'offline.durableItemReceipts',
  text: sql`select queue_item_id,status,error_code,context_json,received_at as event_at
      from offline.sync_item_receipts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
     union all
     select queue_item_id,status,error_code,context_json,created_at as event_at
      from offline.sync_item_attempts where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
     order by event_at,queue_item_id`,
  params: z.tuple([uuid, text, text]), row: z.object({ queue_item_id: text, status: queueStatus, error_code: text.nullable(), context_json: jsonObject.nullable(), event_at: timestamp }), expects: 'many',
});

export const appendIntegrityAttempt = defineQuery({
  name: 'offline.appendIntegrityAttempt',
  text: sql`insert into offline.sync_item_attempts
    (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code,context_json,created_at)
    values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_ITEM_INTEGRITY',$7::jsonb,$8::timestamptz)
    on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
  params: z.tuple([uuid, text, text, text, text, text, text, timestamp]), row: z.object({}), expects: 'none',
});

export const integrityAttemptContext = defineQuery({
  name: 'offline.integrityAttemptContext',
  text: sql`select context_json from offline.sync_item_attempts where tenant_id=$1::uuid
      and device_id=$2 and device_batch_id=$3 and queue_item_id=$4`,
  params: z.tuple([uuid, text, text, text]), row: z.object({ context_json: jsonObject.nullable() }), expects: 'many',
});

export const existingIntegrityConflict = defineQuery({
  name: 'offline.existingIntegrityConflict',
  text: sql`select c.id from offline.sync_conflicts c
    join offline.sync_conflict_evidence e on e.tenant_id=c.tenant_id and e.conflict_id=c.id
    where c.tenant_id=$1::uuid and c.sync_queue_item_id=$2 and c.conflict_type='integrity'
      and e.evidence->'stynx'->>'receivedPayloadHash'=$3 limit 1`,
  params: z.tuple([uuid, text, text]), row: z.object({ id: uuid }), expects: 'many',
});

export const appendIntegrityConflict = defineQuery({
  name: 'offline.appendIntegrityConflict',
  text: sql`insert into offline.sync_conflicts
    (id,tenant_id,sync_queue_item_id,local_entity_id,payload_hash,conflict_type,description,status,created_at)
    values ($1::uuid,$2::uuid,$3,$4,$5,'integrity','Payload hash differs from the stored item.','open',$6::timestamptz)`,
  params: z.tuple([uuid, uuid, text, text, text, timestamp]), row: z.object({}), expects: 'none',
});

export const appendIntegrityEvidence = defineQuery({
  name: 'offline.appendIntegrityEvidence',
  text: sql`insert into offline.sync_conflict_evidence
    (tenant_id,conflict_id,queue_item_id,related_queue_item_id,allowed_actions,evidence)
    values ($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb)`,
  params: z.tuple([uuid, uuid, text, text, text, text]), row: z.object({}), expects: 'none',
});

export const integrityRejectionByIdentity = defineQuery({
  name: 'offline.integrityRejectionByIdentity',
  text: sql`select idempotency_key,payload_hash,context_json,created_at from offline.sync_item_attempts
      where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and queue_item_id=$4
        and error_code='OFFLINE_SYNC_ITEM_INTEGRITY'`,
  params: z.tuple([uuid, text, text, text]), row: z.object({ idempotency_key: text, payload_hash: text, context_json: jsonObject.nullable(), created_at: timestamp }), expects: 'many',
});

export const durableItemByKey = defineQuery({
  name: 'offline.durableItemByKey',
  text: sql`select idempotency_key,queue_item_id,payload_hash,status,error_code,context_json from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text]), row: receiptRow, expects: 'many',
});

export const lockDurableReservation = defineQuery({
  name: 'offline.lockDurableReservation',
  text: sql`select id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,start_number,end_number,next_number,valid_until,status,(valid_until <= clock_timestamp()) as expired from offline.numbering_reservations where tenant_id=$1::uuid and id=$2::uuid for update`,
  params: z.tuple([uuid, uuid]), row: reservationRow, expects: 'many',
});

export const transitionDurableReservation = defineQuery({
  name: 'offline.transitionDurableReservation',
  text: sql`update offline.numbering_reservations set status=$3,audit_actor_id=$4,
      updated_at=$5::timestamptz,settlement_action=$6,settlement_reason=$7,settlement_user_ref=$8,settled_by=$4
      where tenant_id=$1::uuid and id=$2::uuid returning *`,
  params: z.tuple([uuid, uuid, reservationStatus, text, timestamp, z.enum(['block', 'close', 'settle']), text.nullable(), text.nullable()]), row: reservationRow, expects: 'many',
});

export const blockReservationConsumption = defineQuery({
  name: 'offline.blockReservationConsumption',
  text: sql`update offline.numbering_consumption set status='blocked' where tenant_id=$1::uuid and reservation_id=$2::uuid and status='available'`,
  params: z.tuple([uuid, uuid]), row: z.object({}), expects: 'none',
});

export const expireDurableConsumption = defineQuery({
  name: 'offline.expireDurableConsumption',
  text: sql`update offline.numbering_consumption set status='expired' where tenant_id=$1::uuid and reservation_id=$2::uuid and status='available'`,
  params: z.tuple([uuid, uuid]), row: z.object({}), expects: 'none',
});

export const consumptionReservation = defineQuery({
  name: 'offline.consumptionReservation',
  text: sql`select start_number,end_number,to_char(valid_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as valid_until,status from offline.numbering_reservations where tenant_id=$1::uuid and id=$2::uuid`,
  params: z.tuple([uuid, uuid]), row: z.object({ start_number: bigint, end_number: bigint, valid_until: text, status: reservationStatus }), expects: 'many',
});

export const consumptionOverrides = defineQuery({
  name: 'offline.consumptionOverrides',
  text: sql`select number,status,server_entity_id,to_char(finalized_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as finalized_at from offline.numbering_consumption where tenant_id=$1::uuid and reservation_id=$2::uuid`,
  params: z.tuple([uuid, uuid]), row: z.object({ number: bigint, status: z.enum(['available', 'claimed-locally', 'applied', 'blocked', 'expired']), server_entity_id: text.nullable(), finalized_at: text.nullable() }), expects: 'many',
});

export const appendConcurrencyConflict = defineQuery({
  name: 'offline.appendConcurrencyConflict',
  text: sql`insert into offline.sync_conflicts
                  (id,tenant_id,sync_queue_item_id,local_entity_id,payload_hash,conflict_type,description,status,created_at)
                  select $3::uuid,tenant_id,id,local_entity_id,payload_hash,'concurrency',
                    'Concurrent agent activity','open',$4::timestamptz
                  from offline.sync_queue_items where tenant_id=$1::uuid and id=$2`,
  params: z.tuple([uuid, text, uuid, timestamp]), row: z.object({}), expects: 'none',
});

export const appendConcurrencyEvidence = defineQuery({
  name: 'offline.appendConcurrencyEvidence',
  text: sql`insert into offline.sync_conflict_evidence
                  (tenant_id,conflict_id,queue_item_id,related_queue_item_id,allowed_actions,evidence)
                  values ($1::uuid,$2::uuid,$3,$4,$5::jsonb,$6::jsonb)`,
  params: z.tuple([uuid, uuid, text, text, text, text]), row: z.object({}), expects: 'none',
});

export const markConcurrencyQueue = defineQuery({
  name: 'offline.markConcurrencyQueue',
  text: sql`update offline.sync_queue_items set status='conflict',updated_at=$3::timestamptz
                  where tenant_id=$1::uuid and id=$2`,
  params: z.tuple([uuid, text, timestamp]), row: z.object({}), expects: 'none',
});

export const markConcurrencyReceipt = defineQuery({
  name: 'offline.markConcurrencyReceipt',
  text: sql`update offline.sync_item_receipts set status='conflict',
                  context_json=coalesce(context_json,'{}'::jsonb) || coalesce($3::jsonb,'{}'::jsonb) ||
    case when context_json ? 'stynx' or coalesce($5::jsonb,'{}'::jsonb) <> '{}'::jsonb
      then jsonb_build_object('stynx',jsonb_build_object('version',1) || coalesce(context_json->'stynx','{}'::jsonb) || coalesce($5::jsonb,'{}'::jsonb))
      else '{}'::jsonb end,updated_at=$4::timestamptz
                  where tenant_id=$1::uuid and queue_item_id=$2`,
  params: z.tuple([uuid, text, text, timestamp, text]), row: z.object({}), expects: 'none',
});

export const batchLockTimeout = defineQuery({
  name: 'offline.batchLockTimeout',
  text: sql`set local lock_timeout = '100ms'`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});

export const lockBatchIdentity = defineQuery({
  name: 'offline.lockBatchIdentity',
  text: sql`select pg_advisory_xact_lock(hashtextextended($1,0))`,
  params: z.tuple([text]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'many',
});

export const hydrateExistingLegacyReceipts = defineQuery({
  name: 'offline.hydrateExistingLegacyReceipts',
  text: sql`insert into offline.sync_item_receipts
          (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,received_at)
          select tenant_id,idempotency_key,id,device_id,device_batch_id,payload_hash,status,received_at
          from offline.sync_queue_items where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
            and identity_mode='e6' on conflict (tenant_id,idempotency_key) do nothing`,
  params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

export const takeExistingBatchLease = defineQuery({
  name: 'offline.takeExistingBatchLease',
  text: sql`update offline.sync_batches set lease_token=$4::uuid,lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '30 seconds' where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and (lease_token is null or lease_expires_at <= clock_timestamp()) returning *`,
  params: z.tuple([uuid, text, text, uuid]), row: batchRow, expects: 'many',
});

export const existingLegacyBatchKeys = defineQuery({
  name: 'offline.existingLegacyBatchKeys',
  text: sql`select id,idempotency_key from offline.sync_queue_items where tenant_id=$1::uuid
          and device_id=$2 and device_batch_id=$3 and identity_mode='e6' order by id collate "C"`,
  params: z.tuple([uuid, text, text]), row: z.object({ id: text, idempotency_key: text }), expects: 'many',
});

export const insertUnverifiedLegacyBatch = defineQuery({
  name: 'offline.insertUnverifiedLegacyBatch',
  text: sql`insert into offline.sync_batches
          (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status)
          values ($1::uuid,$2,$3,$4,$5,'legacy-unverified',$6::jsonb,'legacy_closed_unverified')
          returning *`,
  params: z.tuple([uuid, text, text, text, text, text]), row: batchRow, expects: 'many',
});

export const hydrateImportedLegacyReceipts = defineQuery({
  name: 'offline.hydrateImportedLegacyReceipts',
  text: sql`insert into offline.sync_item_receipts
          (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,received_at)
          select tenant_id,idempotency_key,id,device_id,device_batch_id,payload_hash,status,received_at
          from offline.sync_queue_items where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
            and identity_mode='e6' on conflict (tenant_id,idempotency_key) do nothing`,
  params: z.tuple([uuid, text, text]), row: z.object({}), expects: 'none',
});

export const lockLastBatchSequence = defineQuery({
  name: 'offline.lockLastBatchSequence',
  text: sql`select batch_sequence from offline.sync_batches where tenant_id=$1::uuid and device_id=$2 and batch_sequence is not null order by batch_sequence desc limit 1 for update`,
  params: z.tuple([uuid, text]), row: z.object({ batch_sequence: bigint }), expects: 'many',
});

export const insertDurableBatch = defineQuery({
  name: 'offline.insertDurableBatch',
  text: sql`insert into offline.sync_batches (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,batch_sequence,context_hash,declared_keys,status,lease_token,lease_generation,lease_expires_at,transport_key,transport_fingerprint,initial_queue_status) values ($1::uuid,$2,$3,$4,$5,$6,$7,$8::jsonb,'open',$9::uuid,1,clock_timestamp()+interval '30 seconds',$10,$11,$12) returning *`,
  params: z.tuple([uuid, text, text, text, text, integer.nullable(), text, text, uuid, text, text, z.enum(['received', 'pending'])]), row: batchRow, expects: 'many',
});

export const legacyBatchIdentity = defineQuery({
  name: 'offline.legacyBatchIdentity',
  text: sql`select id,entity_type,local_entity_id,idempotency_key,payload_hash from offline.sync_queue_items
       where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 order by id collate "C"`,
  params: z.tuple([uuid, text, text]), row: z.object({ id: text, entity_type: text, local_entity_id: text, idempotency_key: text, payload_hash: text }), expects: 'many',
});

export const retryBatchLockTimeout = defineQuery({
  name: 'offline.retryBatchLockTimeout',
  text: sql`set local lock_timeout = '100ms'`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});

export const takeOpenBatchLease = defineQuery({
  name: 'offline.takeOpenBatchLease',
  text: sql`update offline.sync_batches set lease_token=$4::uuid,
          lease_generation=lease_generation+1,lease_expires_at=clock_timestamp()+interval '30 seconds'
          where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and status='open'
            and (lease_token is null or lease_expires_at <= clock_timestamp()) returning *`,
  params: z.tuple([uuid, text, text, uuid]), row: batchRow, expects: 'many',
});

export const lockItemIdentity = defineQuery({
  name: 'offline.lockItemIdentity',
  text: sql`select pg_advisory_xact_lock(hashtextextended($1,0))`,
  params: z.tuple([text]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'many',
});

export const originalItemIdentity = defineQuery({
  name: 'offline.originalItemIdentity',
  text: sql`select id,payload_hash,local_entity_id from offline.sync_queue_items where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text]), row: z.object({ id: text, payload_hash: text, local_entity_id: text }), expects: 'many',
});

export const insertDurableQueueItem = defineQuery({
  name: 'offline.insertDurableQueueItem',
  text: sql`insert into offline.sync_queue_items
        (id,tenant_id,device_batch_id,org_unit_id,agent_id,device_id,entity_type,local_entity_id,
         idempotency_key,payload_hash,payload_json,reserved_number,status,created_locally_at,received_at,identity_mode)
        values ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$15,$13::timestamptz,$14::timestamptz,'ctg9')
        on conflict do nothing`,
  params: z.tuple([text, uuid, text, text, text, text, text, text, text, text, text, integer.nullable(), timestamp, timestamp, z.enum(['received', 'pending'])]), row: z.object({}), expects: 'none',
});

export const storedItemIdentity = defineQuery({
  name: 'offline.storedItemIdentity',
  text: sql`select id,payload_hash,identity_mode,device_id,device_batch_id,org_unit_id,agent_id,status,local_entity_id
         from offline.sync_queue_items where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text]), row: z.object({ id: text, payload_hash: text, identity_mode: z.enum(['e6', 'ctg9']), device_id: text, device_batch_id: text, org_unit_id: text, agent_id: text, status: queueStatus, local_entity_id: text }), expects: 'many',
});

export const appendQueueReuseAttempt = defineQuery({
  name: 'offline.appendQueueReuseAttempt',
  text: sql`insert into offline.sync_item_attempts
          (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code)
          values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_QUEUE_ID_REUSED')
          on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
  params: z.tuple([uuid, text, text, text, text, text]), row: z.object({}), expects: 'none',
});

export const ensureLegacyBatch = defineQuery({
  name: 'offline.ensureLegacyBatch',
  text: sql`insert into offline.sync_batches
          (tenant_id,device_id,device_batch_id,org_unit_id,agent_id,context_hash,declared_keys,status)
          values ($1::uuid,$2,$3,$4,$5,'legacy-unverified',$6::jsonb,'legacy_closed_unverified')
          on conflict (tenant_id,device_id,device_batch_id) do nothing`,
  params: z.tuple([uuid, text, text, text, text, text]), row: z.object({}), expects: 'none',
});

export const ensureLegacyReceipt = defineQuery({
  name: 'offline.ensureLegacyReceipt',
  text: sql`insert into offline.sync_item_receipts
          (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status)
          values ($1::uuid,$2,$3,$4,$5,$6,$7)
          on conflict (tenant_id,idempotency_key) do nothing`,
  params: z.tuple([uuid, text, text, text, text, text, queueStatus]), row: z.object({}), expects: 'none',
});

export const appendLegacyUnappliedAttempt = defineQuery({
  name: 'offline.appendLegacyUnappliedAttempt',
  text: sql`insert into offline.sync_item_attempts
            (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code)
            values ($1::uuid,$2,$3,$4,$5,$6,'rejected','OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED')
            on conflict (tenant_id,device_id,device_batch_id,queue_item_id) do nothing`,
  params: z.tuple([uuid, text, text, text, text, text]), row: z.object({}), expects: 'none',
});

export const insertInitialReceipt = defineQuery({
  name: 'offline.insertInitialReceipt',
  text: sql`insert into offline.sync_item_receipts
        (tenant_id,idempotency_key,queue_item_id,device_id,device_batch_id,payload_hash,status,error_code)
        values ($1::uuid,$2,$3,$4,$5,$6,$8,$7)
        on conflict (tenant_id,idempotency_key) do nothing returning idempotency_key`,
  params: z.tuple([uuid, text, text, text, text, text, text.nullable(), queueStatus]), row: z.object({ idempotency_key: text }), expects: 'many',
});

export const lockInitialReceipt = defineQuery({
  name: 'offline.lockInitialReceipt',
  text: sql`select * from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2 for update`,
  params: z.tuple([uuid, text]), row: receiptRow.extend({ device_id: text, device_batch_id: text }), expects: 'many',
});

export const appendDuplicateAttempt = defineQuery({
  name: 'offline.appendDuplicateAttempt',
  text: sql`insert into offline.sync_item_attempts
            (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code,context_json)
            values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
            on conflict (tenant_id,device_id,device_batch_id,queue_item_id)
            do update set status=excluded.status,error_code=excluded.error_code,context_json=excluded.context_json`,
  params: z.tuple([uuid, text, text, text, text, text, queueStatus, text.nullable(), text]), row: z.object({}), expects: 'none',
});

export const lockApplyingReceipt = defineQuery({
  name: 'offline.lockApplyingReceipt',
  text: sql`select * from offline.sync_item_receipts where tenant_id=$1::uuid and idempotency_key=$2 for update`,
  params: z.tuple([uuid, text]), row: receiptRow.extend({ device_id: text, device_batch_id: text }), expects: 'many',
});

export const queueIdentityExists = defineQuery({
  name: 'offline.queueIdentityExists',
  text: sql`select exists(select 1 from offline.sync_queue_items where tenant_id=$1::uuid and id=$2) as present`,
  params: z.tuple([uuid, text]), row: z.object({ present: z.boolean() }), expects: 'many',
});

export const recordConcurrencyContext = defineQuery({
  name: 'offline.recordConcurrencyContext',
  text: sql`update offline.sync_item_receipts set context_json=coalesce(context_json,'{}'::jsonb) || jsonb_build_object('stynx',$3::jsonb),
                  updated_at=$4::timestamptz where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text, text, timestamp]), row: z.object({}), expects: 'none',
});

export const lockNumberCoverage = defineQuery({
  name: 'offline.lockNumberCoverage',
  text: sql`select r.id,r.status,r.valid_until from offline.numbering_reservations r
               where tenant_id=$1::uuid and device_id=$2 and org_unit_id=$3 and entity_type=$4
                 and start_number<=$5 and end_number>=$5
                 and ($6::uuid is null or id=$6::uuid)
                 and (r.status <> 'cancelled' or exists (
                   select 1 from offline.numbering_consumption c where c.tenant_id=r.tenant_id
                     and c.reservation_id=r.id and c.number=$5 and c.status in ('applied','claimed-locally')))
               order by r.id for update of r`,
  params: z.tuple([uuid, text, text, text, integer, uuid.nullable()]), row: z.object({ id: uuid, status: reservationStatus, valid_until: timestamp }), expects: 'many',
});

export const lockNumberConsumption = defineQuery({
  name: 'offline.lockNumberConsumption',
  text: sql`select status from offline.numbering_consumption
              where tenant_id=$1::uuid and reservation_id=$2::uuid and number=$3 for update`,
  params: z.tuple([uuid, uuid, integer]), row: z.object({ status: z.enum(['available', 'claimed-locally', 'applied', 'blocked', 'expired']) }), expects: 'many',
});

export const claimNumberConsumption = defineQuery({
  name: 'offline.claimNumberConsumption',
  text: sql`insert into offline.numbering_consumption
              (tenant_id,reservation_id,number,status) values ($1::uuid,$2::uuid,$3,'claimed-locally')
              on conflict (tenant_id,reservation_id,number) do update set status='claimed-locally'
                where offline.numbering_consumption.status in ('available','claimed-locally')
              returning number`,
  params: z.tuple([uuid, uuid, integer]), row: z.object({ number: bigint }), expects: 'many',
});

export const applyNumberConsumption = defineQuery({
  name: 'offline.applyNumberConsumption',
  text: sql`update offline.numbering_consumption set status='applied',
              server_entity_id=$4,finalized_at=$5::timestamptz
              where tenant_id=$1::uuid and reservation_id=$2::uuid and number=$3 and status='claimed-locally'`,
  params: z.tuple([uuid, uuid, integer, text.nullable(), timestamp]), row: z.object({}), expects: 'none',
});

export const applyQueueItem = defineQuery({
  name: 'offline.applyQueueItem',
  text: sql`update offline.sync_queue_items set status='applied',updated_at=$3::timestamptz
              where tenant_id=$1::uuid and id=$2`,
  params: z.tuple([uuid, text, timestamp]), row: z.object({}), expects: 'none',
});

export const applyItemReceipt = defineQuery({
  name: 'offline.applyItemReceipt',
  text: sql`update offline.sync_item_receipts set status='applied',error_code=null,
              updated_at=$3::timestamptz where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text, timestamp]), row: z.object({}), expects: 'none',
});

export const recordAppliedContext = defineQuery({
  name: 'offline.recordAppliedContext',
  text: sql`update offline.sync_item_receipts set context_json=coalesce(context_json,'{}'::jsonb) || jsonb_build_object('stynx',$3::jsonb),
            updated_at=$4::timestamptz where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text, text, timestamp]), row: z.object({}), expects: 'none',
});

export const appendDomainConflict = defineQuery({
  name: 'offline.appendDomainConflict',
  text: sql`insert into offline.sync_conflicts
              (id,tenant_id,sync_queue_item_id,local_entity_id,payload_hash,conflict_type,description,status,created_at)
              values ($1::uuid,$2::uuid,$3,$4,$5,$8,$6,'open',$7::timestamptz)`,
  params: z.tuple([uuid, uuid, text, text, text, text, timestamp, text]), row: z.object({}), expects: 'none',
});

export const appendDomainEvidence = defineQuery({
  name: 'offline.appendDomainEvidence',
  text: sql`insert into offline.sync_conflict_evidence
              (tenant_id,conflict_id,queue_item_id,allowed_actions,evidence)
              values ($1::uuid,$2::uuid,$3,$4::jsonb,$5::jsonb)`,
  params: z.tuple([uuid, uuid, text, text, text]), row: z.object({}), expects: 'none',
});

export const recordFailedReceipt = defineQuery({
  name: 'offline.recordFailedReceipt',
  text: sql`update offline.sync_item_receipts set status=$3,error_code=$4,
            context_json=coalesce(context_json,'{}'::jsonb) || coalesce($8::jsonb,'{}'::jsonb) || jsonb_build_object('stynx',$9::jsonb),
            updated_at=$5::timestamptz where tenant_id=$1::uuid and idempotency_key=$2
            and device_id=$6 and status=$7`,
  params: z.tuple([uuid, text, queueStatus, text.nullable(), timestamp, text, queueStatus, text.nullable(), text]), row: z.object({}), expects: 'none',
});

export const recordOutcomeQueue = defineQuery({
  name: 'offline.recordOutcomeQueue',
  text: sql`update offline.sync_queue_items set status=$3,
            updated_at=$4::timestamptz where tenant_id=$1::uuid and id=$2`,
  params: z.tuple([uuid, text, queueStatus, timestamp]), row: z.object({}), expects: 'none',
});

export const appendReapplyAttempt = defineQuery({
  name: 'offline.appendReapplyAttempt',
  text: sql`insert into offline.sync_item_attempts
                  (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code,context_json)
                  values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
                  on conflict (tenant_id,device_id,device_batch_id,queue_item_id)
                  do update set status=excluded.status,error_code=excluded.error_code,context_json=excluded.context_json`,
  params: z.tuple([uuid, text, text, text, text, text, queueStatus, text.nullable(), text]), row: z.object({}), expects: 'none',
});

export const appendFinalAttempt = defineQuery({
  name: 'offline.appendFinalAttempt',
  text: sql`insert into offline.sync_item_attempts
        (tenant_id,device_id,device_batch_id,queue_item_id,idempotency_key,payload_hash,status,error_code,context_json)
        values ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
        on conflict (tenant_id,device_id,device_batch_id,queue_item_id)
        do update set status=excluded.status,error_code=excluded.error_code,context_json=excluded.context_json`,
  params: z.tuple([uuid, text, text, text, text, text, queueStatus, text.nullable(), text]), row: z.object({}), expects: 'none',
});

export const finalizeDurableBatch = defineQuery({
  name: 'offline.finalizeDurableBatch',
  text: sql`update offline.sync_batches set status=$4,response_status=$5,response_body_bytes=$6,response_headers=$9::jsonb,lease_token=null,lease_expires_at=null,updated_at=$7::timestamptz where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3 and lease_token=$8::uuid and lease_generation=$10`,
  params: z.tuple([uuid, text, text, z.enum(['open', 'closed', 'legacy_closed_unverified']), integer.nullable(), z.instanceof(Buffer).nullable(), timestamp, uuid, text, integer]), row: z.object({}), expects: 'none',
});

export const releaseDurableLease = defineQuery({
  name: 'offline.releaseDurableLease',
  text: sql`update offline.sync_batches set lease_token=null,lease_expires_at=null
        where tenant_id=$1::uuid and device_id=$2 and device_batch_id=$3
          and lease_token=$4::uuid and lease_generation=$5 and status='open'`,
  params: z.tuple([uuid, text, text, uuid, integer]), row: z.object({}), expects: 'none',
});
