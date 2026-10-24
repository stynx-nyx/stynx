import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int();
const bigintNumber = z.number().refine(Number.isInteger);
const bigint = z.union([text.regex(/^-?\d+$/u), bigintNumber]);
const timestamp = text;
const reservationStatus = z.enum(['reserved', 'consumed', 'expired', 'cancelled', 'blocked']);
const consumptionStatus = z.enum(['available', 'claimed-locally', 'applied', 'blocked', 'expired']);
const reconciliationResult = z.object({
  reservationId: text, status: reservationStatus,
  consumption: z.array(z.object({ number: bigintNumber, status: consumptionStatus, serverEntityId: text.nullable(), finalizedAt: timestamp.nullable() }).passthrough()),
  reconciliationId: text.optional(), missingOnServer: z.array(bigintNumber), unexpectedOnServer: z.array(bigintNumber),
}).passthrough().transform(({ reconciliationId, ...result }) => ({
  ...result, ...(reconciliationId === undefined ? {} : { reconciliationId }),
}));
const historyRow = z.object({
  id: uuid, tenant_id: uuid, reservation_id: uuid, actor_id: text, created_at: timestamp,
  claimed_numbers: z.array(bigint), user_ref: text.nullable(), idempotency_key: text.nullable(),
  request_fingerprint: text.nullable(), result_json: reconciliationResult,
});

export const lockReconciliationReservation = defineQuery({
  name: 'offline.lockReconciliationReservation',
  text: sql`select start_number,end_number,status,to_char(valid_until at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as valid_until
      from offline.numbering_reservations where tenant_id=$1::uuid and id=$2::uuid for update`,
  params: z.tuple([uuid, uuid]), row: z.object({ start_number: bigint, end_number: bigint, status: reservationStatus, valid_until: timestamp }), expects: 'zero-or-one',
});

export const replayReconciliation = defineQuery({
  name: 'offline.replayReconciliation',
  text: sql`select request_fingerprint,result_json from offline.numbering_reconciliations
         where tenant_id=$1::uuid and reservation_id=$2::uuid and idempotency_key=$3`,
  params: z.tuple([uuid, uuid, text]), row: z.object({ request_fingerprint: text.nullable(), result_json: reconciliationResult }), expects: 'zero-or-one',
});

export const claimReconciliationNumber = defineQuery({
  name: 'offline.claimReconciliationNumber',
  text: sql`insert into offline.numbering_consumption (tenant_id,reservation_id,number,status)
          values ($1::uuid,$2::uuid,$3,'claimed-locally') on conflict (tenant_id,reservation_id,number) do update
          set status=case when offline.numbering_consumption.status='available' then 'claimed-locally' else offline.numbering_consumption.status end`,
  params: z.tuple([uuid, uuid, integer]), row: z.object({}), expects: 'none',
});

export const touchReconciliationReservation = defineQuery({
  name: 'offline.touchReconciliationReservation',
  text: sql`update offline.numbering_reservations set audit_actor_id=$3,updated_at=$4::timestamptz
        where tenant_id=$1::uuid and id=$2::uuid`,
  params: z.tuple([uuid, uuid, text, timestamp]), row: z.object({}), expects: 'none',
});

export const reconciliationConsumption = defineQuery({
  name: 'offline.reconciliationConsumption',
  text: sql`select number,status,server_entity_id,to_char(finalized_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as finalized_at from offline.numbering_consumption
       where tenant_id=$1::uuid and reservation_id=$2::uuid`,
  params: z.tuple([uuid, uuid]), row: z.object({ number: bigint, status: consumptionStatus, server_entity_id: text.nullable(), finalized_at: timestamp.nullable() }), expects: 'many',
});

export const appendReconciliation = defineQuery({
  name: 'offline.appendReconciliation',
  text: sql`insert into offline.numbering_reconciliations
      (id,tenant_id,reservation_id,actor_id,created_at,claimed_numbers,user_ref,idempotency_key,request_fingerprint,result_json)
      values ($1::uuid,$2::uuid,$3::uuid,$4,$5::timestamptz,$6::bigint[],$7,$8,$9,$10::jsonb)`,
  params: z.tuple([uuid, uuid, uuid, text, timestamp, z.array(integer).readonly(), text.nullable(), text.nullable(), text.nullable(), text]), row: z.object({}), expects: 'none',
});

export const listReconciliations = defineQuery({
  name: 'offline.listReconciliations',
  text: sql`select id,tenant_id,reservation_id,actor_id,to_char(created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at,
      claimed_numbers,user_ref,idempotency_key,request_fingerprint,result_json from offline.numbering_reconciliations
      where tenant_id=$1::uuid and reservation_id=$2::uuid
        and ($3::timestamptz is null or (created_at,id) < ($3::timestamptz,$4::uuid))
      order by created_at desc,id desc limit $5`,
  params: z.tuple([uuid, uuid, timestamp.nullable(), uuid.nullable(), integer.nonnegative().max(2147483647)]), row: historyRow, expects: 'many',
});

