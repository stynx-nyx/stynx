import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int();
const bigintNumber = z.number().refine(Number.isInteger);
const bigint = z.union([text.regex(/^-?\d+$/u), bigintNumber]);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const reservationRow = z.object({
  id: uuid, range_id: uuid, tenant_id: uuid, org_unit_id: text, entity_type: text,
  series: text, agent_id: text, device_id: text, shift_id: text.nullable(),
  start_number: bigint, end_number: bigint, next_number: bigint, valid_until: timestamp,
  status: z.enum(['reserved', 'consumed', 'expired', 'cancelled', 'blocked']),
  reservation_origin: z.enum(['e6', 'ctg9']),
});
export type ReservationRow = z.output<typeof reservationRow>;

export const lockReservationScopeQuery = defineQuery({
  name: 'offline.lockReservationScopeQuery',
  text: sql`select pg_advisory_xact_lock(hashtextextended(
    'stynx-offline-active:' || jsonb_build_array($1::uuid::text,$2::text,
      nullif($3::text,'stynx:no-shift'))::text,0))`,
  params: z.tuple([uuid, text, text.nullable()]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'zero-or-one',
});

export const reservationByIdempotencyKey = defineQuery({
  name: 'offline.reservationByIdempotencyKey',
  text: sql`select id,range_id,tenant_id,org_unit_id,entity_type,series,agent_id,device_id,
  shift_id,start_number,end_number,next_number,valid_until,status,reservation_origin,idempotency_fingerprint from offline.numbering_reservations
      where tenant_id=$1::uuid and idempotency_key=$2`,
  params: z.tuple([uuid, text]), row: reservationRow.extend({ idempotency_fingerprint: text.nullable() }), expects: 'zero-or-one',
});

export const lockReservationKey = defineQuery({
  name: 'offline.lockReservationKey',
  text: sql`select pg_advisory_xact_lock(hashtextextended($1,0))`,
  params: z.tuple([text]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'zero-or-one',
});

export const activeReservation = defineQuery({
  name: 'offline.activeReservation',
  text: sql`select id from offline.numbering_reservations
      where tenant_id=$1::uuid and device_id=$2
        and nullif(shift_id,'stynx:no-shift') is not distinct from nullif($3::text,'stynx:no-shift')
        and status in ('reserved','blocked') and valid_until>clock_timestamp()
        and reservation_origin in ('e6','ctg9') limit 1`,
  params: z.tuple([uuid, text, text.nullable()]), row: z.object({ id: uuid }), expects: 'zero-or-one',
});

export const lockAllocationRange = defineQuery({
  name: 'offline.lockAllocationRange',
  text: sql`select id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status
      from offline.numbering_ranges where tenant_id=$1::uuid and ($2::uuid is null or id=$2::uuid)
        and ($2::uuid is not null or (org_unit_id=$3 and entity_type=$4
          and ($5::text is null or series=$5) and ($5::text is not null or status<>'cancelled')))
      order by series limit 1 for update`,
  params: z.tuple([uuid, uuid.nullable(), text, text, text.nullable()]), row: z.object({ id: uuid, tenant_id: uuid, org_unit_id: text, entity_type: text, series: text, start_number: bigint, end_number: bigint, next_number: bigint, status: z.enum(['active', 'exhausted', 'cancelled']) }), expects: 'zero-or-one',
});

export const advanceAllocationRange = defineQuery({
  name: 'offline.advanceAllocationRange',
  text: sql`update offline.numbering_ranges set next_number=$3,
      status=case when $2=end_number then 'exhausted' else status end,updated_at=$4::timestamptz
      where tenant_id=$1::uuid and id=$5::uuid`,
  params: z.tuple([uuid, integer, integer, timestamp, uuid]), row: z.object({}), expects: 'none',
});

export const insertReservation = defineQuery({
  name: 'offline.insertReservation',
  text: sql`insert into offline.numbering_reservations
      (id,tenant_id,range_id,org_unit_id,entity_type,series,agent_id,device_id,shift_id,
        start_number,end_number,next_number,reserved_at,valid_until,status,reservation_origin,
        idempotency_key,idempotency_fingerprint,audit_actor_id)
      values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$10,$12::timestamptz,
        $13::timestamptz,'reserved','ctg9',$14,$15,$16) returning id,range_id,tenant_id,org_unit_id,entity_type,series,agent_id,device_id,
  shift_id,start_number,end_number,next_number,valid_until,status,reservation_origin`,
  params: z.tuple([uuid, uuid, uuid, text, text, text, text, text, text.nullable(), integer, integer, timestamp, timestamp, text.nullable(), text.nullable(), text]), row: reservationRow, expects: 'one',
});

export const lockReservationById = defineQuery({
  name: 'offline.lockReservationById',
  text: sql`select id,range_id,tenant_id,org_unit_id,entity_type,series,agent_id,device_id,
  shift_id,start_number,end_number,next_number,valid_until,status,reservation_origin from offline.numbering_reservations
      where tenant_id=$1::uuid and id=$2::uuid for update`,
  params: z.tuple([uuid, uuid]), row: reservationRow, expects: 'zero-or-one',
});

export const cancelReservation = defineQuery({
  name: 'offline.cancelReservation',
  text: sql`update offline.numbering_reservations
      set status='cancelled',cancellation_reason=$3,cancelled_by=$4,audit_actor_id=$4,updated_at=$5::timestamptz
      where tenant_id=$1::uuid and id=$2::uuid returning id,range_id,tenant_id,org_unit_id,entity_type,series,agent_id,device_id,
  shift_id,start_number,end_number,next_number,valid_until,status,reservation_origin`,
  params: z.tuple([uuid, uuid, text.nullable(), text, timestamp]), row: reservationRow, expects: 'one',
});

export const highestReservationConsumption = defineQuery({
  name: 'offline.highestReservationConsumption',
  text: sql`select max(number) as number
      from offline.numbering_consumption where tenant_id=$1::uuid and reservation_id=$2::uuid
        and status in ('applied','claimed-locally')`,
  params: z.tuple([uuid, uuid]), row: z.object({ number: bigint.nullable() }), expects: 'zero-or-one',
});

export const reclaimReservationRange = defineQuery({
  name: 'offline.reclaimReservationRange',
  text: sql`update offline.numbering_ranges set next_number=$3,
      status=case when status='exhausted' then 'active' else status end,updated_at=$4::timestamptz
      where tenant_id=$1::uuid and id=$2::uuid and next_number=$5 and status<>'cancelled'`,
  params: z.tuple([uuid, uuid, integer, timestamp, integer]), row: z.object({}), expects: 'none',
});

export const expireReservationConsumption = defineQuery({
  name: 'offline.expireReservationConsumption',
  text: sql`update offline.numbering_consumption set status='expired'
      where tenant_id=$1::uuid and reservation_id=$2::uuid and status='available'`,
  params: z.tuple([uuid, uuid]), row: z.object({}), expects: 'none',
});

