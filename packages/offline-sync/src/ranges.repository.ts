import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const integer = z.number().int();
const bigintNumber = z.number().refine(Number.isInteger);
const bigint = z.union([text.regex(/^-?\d+$/u), bigintNumber]);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const rangeRow = z.object({
  id: uuid, tenant_id: uuid, org_unit_id: text, entity_type: text, series: text,
  start_number: bigint, end_number: bigint, next_number: bigint,
  status: z.enum(['active', 'exhausted', 'cancelled']),
  consumer_attributes: z.record(text, z.json()).nullable(), created_by: text.nullable(),
  created_at: timestamp, updated_at: timestamp.nullable(), cancelled_by: text.nullable(),
  cancelled_at: timestamp.nullable(), cancellation_reason: text.nullable(),
  creation_fingerprint: text.nullable(), creation_receipt: z.json(),
});
export type RangeRow = z.output<typeof rangeRow>;

export const lockRangeCreation = defineQuery({
  name: 'offline.lockRangeCreation',
  text: sql`select pg_advisory_xact_lock(hashtextextended($1,0))`,
  params: z.tuple([text]), row: z.object({ pg_advisory_xact_lock: z.literal('') }), expects: 'zero-or-one',
});

export const rangeByCreationKey = defineQuery({
  name: 'offline.rangeByCreationKey',
  text: sql`select id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt,(extract(epoch from created_at)*1000000)::numeric(30,0)::text as created_us from offline.numbering_ranges
        where tenant_id=$1::uuid and creation_key=$2`,
  params: z.tuple([uuid, text]), row: rangeRow.extend({ created_us: text.regex(/^-?\d+$/u) }), expects: 'zero-or-one',
});

export const insertRange = defineQuery({
  name: 'offline.insertRange',
  text: sql`insert into offline.numbering_ranges
      (id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
        consumer_attributes,created_by,created_at,creation_key,creation_fingerprint,creation_receipt)
      values ($1::uuid,$2::uuid,$3,$4,$5,$6,$7,$6,'active',$8::json,$9,$10::timestamptz,$11,$12,$13::jsonb)
      returning id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt`,
  params: z.tuple([uuid, uuid, text, text, text, integer, integer, text.nullable(), text, timestamp, text.nullable(), text.nullable(), text.nullable()]), row: rangeRow, expects: 'one',
});

export const rangeById = defineQuery({
  name: 'offline.rangeById',
  text: sql`select id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt from offline.numbering_ranges
      where tenant_id=$1::uuid and id=$2::uuid`,
  params: z.tuple([uuid, uuid]), row: rangeRow, expects: 'zero-or-one',
});

export const listRanges = defineQuery({
  name: 'offline.listRanges',
  text: sql`select id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt from offline.numbering_ranges
      where tenant_id=$1::uuid and ($2::text is null or org_unit_id=$2)
        and ($3::text is null or entity_type=$3) and ($4::text is null or series=$4)
        and ($5::text is null or status=$5) and ($6::uuid is null or id>$6::uuid)
      order by id limit $7`,
  params: z.tuple([uuid, text.nullable(), text.nullable(), text.nullable(), text.nullable(), uuid.nullable(), integer.nonnegative().max(2147483647)]), row: rangeRow, expects: 'many',
});

export const lockRangeById = defineQuery({
  name: 'offline.lockRangeById',
  text: sql`select id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt from offline.numbering_ranges
      where tenant_id=$1::uuid and id=$2::uuid for update`,
  params: z.tuple([uuid, uuid]), row: rangeRow, expects: 'zero-or-one',
});

export const cancelRange = defineQuery({
  name: 'offline.cancelRange',
  text: sql`update offline.numbering_ranges set status='cancelled',
      cancelled_by=$3,cancelled_at=$4::timestamptz,cancellation_reason=$5,updated_at=$4::timestamptz
      where tenant_id=$1::uuid and id=$2::uuid returning id,tenant_id,org_unit_id,entity_type,series,start_number,end_number,next_number,status,
  consumer_attributes,created_by,created_at,updated_at,cancelled_by,cancelled_at,cancellation_reason,
  creation_fingerprint,creation_receipt`,
  params: z.tuple([uuid, uuid, text, timestamp, text.nullable()]), row: rangeRow, expects: 'one',
});

