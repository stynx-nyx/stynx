import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import type { OutboxEventRow, OutboxEventRetirementResult } from './types.js';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const number = z.custom<number>((value) => typeof value === 'number');
const timestamp = z.union([z.instanceof(Date), text, z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
// This field is an opaque public Record<string, unknown>, not a JSON-tree
// normalization boundary. Preserve its own keys, nested values and identity.
const json = z.custom<Record<string, unknown>>(
  (value): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value),
);
// Inspect every own enumerable value, including an own __proto__ data key,
// without rebuilding the request-header dictionary.
const requestHeaders = z.custom<Record<string, string>>(
  (value): value is Record<string, string> =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.values(value).every((entry: unknown) => typeof entry === 'string'),
);
const status = z.enum(['PENDING', 'SENT', 'SENT_UNRESOLVED', 'ERROR', 'ACKED', 'RETIRED']);
const retirement = z.object({ id: uuid, tenantId: uuid, eventId: uuid, idempotencyKey: text, actorId: uuid, reason: text,
 previousStatus: z.enum(['PENDING', 'SENT', 'SENT_UNRESOLVED', 'ERROR']), retiredAt: timestamp }).passthrough();
const deliveryRow = z.object({ id: uuid, tenantId: uuid, entity: text, entityId: text, idempotencyKey: text,
 metadata: json.nullable(), createdAt: timestamp, status: status.nullable(), attempts: number.nullable(),
 lastError: text.nullable(), nextAttemptAt: timestamp.nullable(), leaseUntil: timestamp.nullable(), updatedAt: timestamp.nullable(),
 retirement: retirement.nullish(),
});
const attemptRow = z.object({ id: uuid, eventId: uuid, attemptOrdinal: number, provider: text.nullable(), protocol: text.nullable(),
 requestSha256: text.nullable(), responseSha256: text.nullable(), responseStatus: number.nullable(),
 requestHeaders: requestHeaders.nullable(), evidenceState: json,
 result: z.enum(['CLAIMED', 'SENT', 'ERROR', 'LEGACY_HISTORY_UNAVAILABLE']), error: text.nullable(),
 leasedAt: timestamp.nullable(), completedAt: timestamp.nullable(), legacyMessageId: uuid.nullable(),
});
const claimedRow = z.object({ tenant_id: uuid, event_id: uuid, attempts: number, entity: text, entity_id: text,
 idempotency_key: text, payload: json, metadata: json.nullable(), created_at: timestamp });

export const claimTenantEvents = defineQuery({
 name: 'outbox.claimTenantEvents', text: sql`with due as (
           select d.tenant_id,d.event_id
             from outbox.event_delivery d join outbox.events e
               on e.tenant_id=d.tenant_id and e.id=d.event_id
            where d.tenant_id=$1::uuid and e.tenant_id=$1::uuid
              and (d.legacy_id is null or
                   (select state from outbox.legacy_ownership where id=true)='NEW')
              and ((d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp())
                   or (d.status='SENT' and d.lease_until<clock_timestamp()))
              and not exists (
                select 1 from outbox.events p join outbox.event_delivery pd
                  on pd.tenant_id=p.tenant_id and pd.event_id=p.id
                 where p.tenant_id=$1::uuid and pd.tenant_id=$1::uuid
                   and p.entity=e.entity and p.entity_id=e.entity_id
                   and (p.created_at,p.id)<(e.created_at,e.id) and pd.status not in ('ACKED','RETIRED')
              )
              
            order by e.created_at,e.id limit $2 for update of d skip locked
         ), claimed as (
           update outbox.event_delivery d
              set status='SENT',attempts=d.attempts+1,
                  lease_until=clock_timestamp()+($3::integer * interval '1 millisecond'),
                  next_attempt_at=null,updated_at=clock_timestamp()
             from due where d.tenant_id=$1::uuid and d.tenant_id=due.tenant_id and d.event_id=due.event_id
           returning d.tenant_id,d.event_id,d.attempts
         )
         select c.*,e.entity,e.entity_id,e.idempotency_key,e.payload,e.metadata,e.created_at
           from claimed c join outbox.events e on e.tenant_id=$1::uuid and e.tenant_id=c.tenant_id and e.id=c.event_id
          order by e.created_at,e.id`,
 params: z.tuple([uuid, number, number]), row: claimedRow, expects: 'many',
});

export const claimTenantEventsFiltered = defineQuery({
 name: 'outbox.claimTenantEventsFiltered', text: sql`with due as (
           select d.tenant_id,d.event_id
             from outbox.event_delivery d join outbox.events e
               on e.tenant_id=d.tenant_id and e.id=d.event_id
            where d.tenant_id=$1::uuid and e.tenant_id=$1::uuid
              and (d.legacy_id is null or
                   (select state from outbox.legacy_ownership where id=true)='NEW')
              and ((d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp())
                   or (d.status='SENT' and d.lease_until<clock_timestamp()))
              and not exists (
                select 1 from outbox.events p join outbox.event_delivery pd
                  on pd.tenant_id=p.tenant_id and pd.event_id=p.id
                 where p.tenant_id=$1::uuid and pd.tenant_id=$1::uuid
                   and p.entity=e.entity and p.entity_id=e.entity_id
                   and (p.created_at,p.id)<(e.created_at,e.id) and pd.status not in ('ACKED','RETIRED')
              )
              and (e.entity=any($4::text[]) or exists (
                select 1 from unnest($5::text[]) as prefix(value)
                 where left(e.entity,length(prefix.value))=prefix.value))
            order by e.created_at,e.id limit $2 for update of d skip locked
         ), claimed as (
           update outbox.event_delivery d
              set status='SENT',attempts=d.attempts+1,
                  lease_until=clock_timestamp()+($3::integer * interval '1 millisecond'),
                  next_attempt_at=null,updated_at=clock_timestamp()
             from due where d.tenant_id=$1::uuid and d.tenant_id=due.tenant_id and d.event_id=due.event_id
           returning d.tenant_id,d.event_id,d.attempts
         )
         select c.*,e.entity,e.entity_id,e.idempotency_key,e.payload,e.metadata,e.created_at
           from claimed c join outbox.events e on e.tenant_id=$1::uuid and e.tenant_id=c.tenant_id and e.id=c.event_id
          order by e.created_at,e.id`,
 params: z.tuple([uuid, number, number, z.array(text).nullable(), z.array(text).nullable()]), row: claimedRow, expects: 'many',
});

export const claimOwnerEvents = defineQuery({
 name: 'outbox.claimOwnerEvents', text: sql`with due as (
           select d.tenant_id,d.event_id
             from outbox.event_delivery d join outbox.events e
               on e.tenant_id=d.tenant_id and e.id=d.event_id
            where (d.legacy_id is null or
                   (select state from outbox.legacy_ownership where id=true)='NEW')
              and ((d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp())
                   or (d.status='SENT' and d.lease_until<clock_timestamp()))
              and not exists (
                select 1 from outbox.events p join outbox.event_delivery pd
                  on pd.tenant_id=p.tenant_id and pd.event_id=p.id
                 where p.tenant_id=e.tenant_id and p.entity=e.entity and p.entity_id=e.entity_id
                   and (p.created_at,p.id)<(e.created_at,e.id) and pd.status not in ('ACKED','RETIRED')
              )
              
            order by e.created_at,e.id limit $1 for update of d skip locked
         ), claimed as (
           update outbox.event_delivery d
              set status='SENT',attempts=d.attempts+1,
                  lease_until=clock_timestamp()+($2::integer * interval '1 millisecond'),
                  next_attempt_at=null,updated_at=clock_timestamp()
             from due where d.tenant_id=due.tenant_id and d.event_id=due.event_id
           returning d.tenant_id,d.event_id,d.attempts,d.status
         )
         select c.*,e.entity,e.entity_id,e.idempotency_key,e.payload,e.metadata,e.created_at
           from claimed c join outbox.events e on e.tenant_id=c.tenant_id and e.id=c.event_id
          order by e.created_at,e.id`,
 params: z.tuple([number, number]), row: claimedRow.extend({ status: text }), expects: 'many',
});

export const claimOwnerEventsFiltered = defineQuery({
 name: 'outbox.claimOwnerEventsFiltered', text: sql`with due as (
           select d.tenant_id,d.event_id
             from outbox.event_delivery d join outbox.events e
               on e.tenant_id=d.tenant_id and e.id=d.event_id
            where (d.legacy_id is null or
                   (select state from outbox.legacy_ownership where id=true)='NEW')
              and ((d.status in ('PENDING','ERROR') and coalesce(d.next_attempt_at,e.created_at)<=clock_timestamp())
                   or (d.status='SENT' and d.lease_until<clock_timestamp()))
              and not exists (
                select 1 from outbox.events p join outbox.event_delivery pd
                  on pd.tenant_id=p.tenant_id and pd.event_id=p.id
                 where p.tenant_id=e.tenant_id and p.entity=e.entity and p.entity_id=e.entity_id
                   and (p.created_at,p.id)<(e.created_at,e.id) and pd.status not in ('ACKED','RETIRED')
              )
              and (e.entity=any($3::text[]) or exists (
                select 1 from unnest($4::text[]) as prefix(value)
                 where left(e.entity,length(prefix.value))=prefix.value))
            order by e.created_at,e.id limit $1 for update of d skip locked
         ), claimed as (
           update outbox.event_delivery d
              set status='SENT',attempts=d.attempts+1,
                  lease_until=clock_timestamp()+($2::integer * interval '1 millisecond'),
                  next_attempt_at=null,updated_at=clock_timestamp()
             from due where d.tenant_id=due.tenant_id and d.event_id=due.event_id
           returning d.tenant_id,d.event_id,d.attempts,d.status
         )
         select c.*,e.entity,e.entity_id,e.idempotency_key,e.payload,e.metadata,e.created_at
           from claimed c join outbox.events e on e.tenant_id=c.tenant_id and e.id=c.event_id
          order by e.created_at,e.id`,
 params: z.tuple([number, number, z.array(text).nullable(), z.array(text).nullable()]), row: claimedRow.extend({ status: text }), expects: 'many',
});

export const listEventRows = defineQuery({
 name: 'outbox.listEventRows', text: sql`select e.id,e.tenant_id as "tenantId",e.entity,e.entity_id as "entityId",
  e.idempotency_key as "idempotencyKey",e.metadata,e.created_at as "createdAt",d.status,d.attempts,
  d.last_error as "lastError",d.next_attempt_at as "nextAttemptAt",d.lease_until as "leaseUntil",d.updated_at as "updatedAt",
  (select row_to_json(receipt) from (select id,tenant_id as "tenantId",event_id as "eventId",
  idempotency_key as "idempotencyKey",actor_id as "actorId",reason,
  previous_status as "previousStatus",retired_at as "retiredAt"
    from outbox.event_retirements where tenant_id=e.tenant_id and event_id=e.id) receipt) as retirement
         from outbox.events e left join outbox.event_delivery d
           on d.tenant_id=$1::uuid and d.tenant_id=e.tenant_id and d.event_id=e.id
        where e.tenant_id=$1::uuid
          and ($2::text[] is null or d.status=any($2::text[]))
          and ($3::text is null or e.entity=$3)
          and ($4::text is null or left(e.entity,length($4))=$4)
          and ($5::timestamptz is null or (e.created_at,e.id)<($5::timestamptz,$6::uuid))
        order by e.created_at desc,e.id desc limit $7`,
 params: z.tuple([uuid, z.array(z.unknown()).nullable(), text.nullable(), text.nullable(), z.instanceof(Date).nullable(), uuid.nullable(), number]), row: deliveryRow, expects: 'many',
});

export const aggregateEventRows = defineQuery({
 name: 'outbox.aggregateEventRows', text: sql`select * from (
         select e.id,e.tenant_id as "tenantId",e.entity,e.entity_id as "entityId",
  e.idempotency_key as "idempotencyKey",e.metadata,e.created_at as "createdAt",d.status,d.attempts,
  d.last_error as "lastError",d.next_attempt_at as "nextAttemptAt",d.lease_until as "leaseUntil",d.updated_at as "updatedAt",
  (select row_to_json(receipt) from (select id,tenant_id as "tenantId",event_id as "eventId",
  idempotency_key as "idempotencyKey",actor_id as "actorId",reason,
  previous_status as "previousStatus",retired_at as "retiredAt"
    from outbox.event_retirements where tenant_id=e.tenant_id and event_id=e.id) receipt) as retirement,
                row_number() over (order by e.created_at,e.id)::integer as "position",
                row_number() over (partition by d.status order by e.created_at,e.id)::integer as "statusRank",
                count(*) over (partition by d.status)::integer as "statusCount"
           from outbox.events e join outbox.event_delivery d
             on d.tenant_id=$1::uuid and d.tenant_id=e.tenant_id and d.event_id=e.id
          where e.tenant_id=$1::uuid and e.entity=$2 and e.entity_id=$3
       ) ranked where "position"<=$4 or "statusRank"=1 order by "position"`,
 params: z.tuple([uuid, text, text, number]), row: deliveryRow.extend({ position: number, statusRank: number, statusCount: number }), expects: 'many',
});

export const eventAttemptRows = defineQuery({
 name: 'outbox.eventAttemptRows', text: sql`select id,event_id as "eventId",attempt_ordinal as "attemptOrdinal",provider,protocol,
              request_sha256 as "requestSha256",response_sha256 as "responseSha256",
              response_status as "responseStatus",request_headers as "requestHeaders",
              evidence_state as "evidenceState",result,error,leased_at as "leasedAt",
              completed_at as "completedAt",legacy_message_id as "legacyMessageId"
              
         from outbox.event_attempts
        where tenant_id=$1::uuid and event_id=$2::uuid order by attempt_ordinal,id`,
 params: z.tuple([uuid, uuid]), row: attemptRow, expects: 'many',
});

export const eventAttemptRowsWithBytes = defineQuery({
 name: 'outbox.eventAttemptRowsWithBytes', text: sql`select id,event_id as "eventId",attempt_ordinal as "attemptOrdinal",provider,protocol,
              request_sha256 as "requestSha256",response_sha256 as "responseSha256",
              response_status as "responseStatus",request_headers as "requestHeaders",
              evidence_state as "evidenceState",result,error,leased_at as "leasedAt",
              completed_at as "completedAt",legacy_message_id as "legacyMessageId"
              ,request_bytes as "requestBytes",response_bytes as "responseBytes"
         from outbox.event_attempts
        where tenant_id=$1::uuid and event_id=$2::uuid order by attempt_ordinal,id`,
 params: z.tuple([uuid, uuid]), row: attemptRow.extend({ requestBytes: z.instanceof(Buffer).nullable(), responseBytes: z.instanceof(Buffer).nullable() }), expects: 'many',
});

export const queueHealthRows = defineQuery({
 name: 'outbox.queueHealthRows', text: sql`select d.status,count(*)::integer as count,min(e.created_at) filter (where d.status not in ('ACKED','RETIRED')) as oldest
         from outbox.event_delivery d join outbox.events e
           on e.tenant_id=$1::uuid and e.tenant_id=d.tenant_id and e.id=d.event_id
        where d.tenant_id=$1::uuid
          and ($2::text is null or e.entity=$2)
          and ($3::text is null or left(e.entity,length($3))=$3)
          
        group by d.status`,
 params: z.tuple([uuid, text.nullable(), text.nullable()]), row: z.object({ status, count: number, oldest: timestamp.nullable() }), expects: 'many',
});

export const queueHealthRowsFiltered = defineQuery({
 name: 'outbox.queueHealthRowsFiltered', text: sql`select d.status,count(*)::integer as count,min(e.created_at) filter (where d.status not in ('ACKED','RETIRED')) as oldest
         from outbox.event_delivery d join outbox.events e
           on e.tenant_id=$1::uuid and e.tenant_id=d.tenant_id and e.id=d.event_id
        where d.tenant_id=$1::uuid
          and ($2::text is null or e.entity=$2)
          and ($3::text is null or left(e.entity,length($3))=$3)
          and (e.entity=any($4::text[]) or exists (
                select 1 from unnest($5::text[]) as prefix(value)
                 where left(e.entity,length(prefix.value))=prefix.value))
        group by d.status`,
 params: z.tuple([uuid, text.nullable(), text.nullable(), z.array(text).nullable(), z.array(text).nullable()]), row: z.object({ status, count: number, oldest: timestamp.nullable() }), expects: 'many',
});

export const eventDeliveryRows = defineQuery({
 name: 'outbox.eventDeliveryRows', text: sql`select e.id,e.tenant_id as "tenantId",e.entity,e.entity_id as "entityId",
  e.idempotency_key as "idempotencyKey",e.metadata,e.created_at as "createdAt",d.status,d.attempts,
  d.last_error as "lastError",d.next_attempt_at as "nextAttemptAt",d.lease_until as "leaseUntil",d.updated_at as "updatedAt",
  (select row_to_json(receipt) from (select id,tenant_id as "tenantId",event_id as "eventId",
  idempotency_key as "idempotencyKey",actor_id as "actorId",reason,
  previous_status as "previousStatus",retired_at as "retiredAt"
    from outbox.event_retirements where tenant_id=e.tenant_id and event_id=e.id) receipt) as retirement
         from outbox.events e join outbox.event_delivery d
           on d.tenant_id=$1::uuid and d.tenant_id=e.tenant_id and d.event_id=e.id
        where e.tenant_id=$1::uuid and e.id=$2::uuid `,
 params: z.tuple([uuid, uuid]), row: deliveryRow, expects: 'many',
});


const appendedEvent = z.object({
  id: uuid, tenantId: uuid, entity: text, entityId: text, idempotencyKey: text,
  payload: json, metadata: json.nullable(), createdAt: timestamp,
});

function isOpaqueRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRawTimestamp(value: unknown): value is Date | string | number {
  return value instanceof Date || typeof value === 'string'
    || value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY;
}

// These guards prove the original row independently of Zod's parsed copy.
// SQL projects metadata even when null; the public construction field remains optional.
export function isAppendedEventRow(value: unknown): value is OutboxEventRow {
  return isOpaqueRecord(value)
    && typeof value.id === 'string' && typeof value.tenantId === 'string'
    && typeof value.entity === 'string' && typeof value.entityId === 'string'
    && typeof value.idempotencyKey === 'string'
    && isOpaqueRecord(value.payload)
    && (value.metadata === null || isOpaqueRecord(value.metadata))
    && isRawTimestamp(value.createdAt);
}

export function isRetirementResult(value: unknown): value is OutboxEventRetirementResult {
  return isOpaqueRecord(value)
    && typeof value.id === 'string' && typeof value.tenantId === 'string'
    && typeof value.eventId === 'string' && typeof value.idempotencyKey === 'string'
    && typeof value.actorId === 'string' && typeof value.reason === 'string'
    && (value.previousStatus === 'PENDING' || value.previousStatus === 'SENT'
      || value.previousStatus === 'SENT_UNRESOLVED' || value.previousStatus === 'ERROR')
    && isRawTimestamp(value.retiredAt);
}

export const appendEventRow = defineQuery({
  name: 'outbox.appendEventRow', text: sql`insert into outbox.events
           (id,tenant_id,entity,entity_id,idempotency_key,payload,metadata,created_at)
         values (outbox.event_uuid($1::bigint,nextval('outbox.event_order_seq')), $2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,to_timestamp($1::double precision/1000))
         on conflict (tenant_id,idempotency_key) do nothing
         returning id,tenant_id as "tenantId",entity,entity_id as "entityId",idempotency_key as "idempotencyKey",payload,metadata,created_at as "createdAt"`,
  params: z.tuple([text, uuid, text, text, text, text.optional(), text.nullish()]), row: appendedEvent, expects: 'many',
});

export const findAppendedEventRow = defineQuery({
  name: 'outbox.findAppendedEventRow', text: sql`select id,tenant_id as "tenantId",entity,entity_id as "entityId",idempotency_key as "idempotencyKey",payload,metadata,created_at as "createdAt"
             from outbox.events where tenant_id=$1::uuid and idempotency_key=$2
               and entity=$3 and entity_id=$4 and payload=$5::jsonb
               and metadata is not distinct from $6::jsonb`,
  params: z.tuple([uuid, text, text, text, text.optional(), text.nullish()]), row: appendedEvent, expects: 'many',
});

export const findRetirementReceipt = defineQuery({
  name: 'outbox.findRetirementReceipt', text: sql`select id,tenant_id as "tenantId",event_id as "eventId",
  idempotency_key as "idempotencyKey",actor_id as "actorId",reason,
  previous_status as "previousStatus",retired_at as "retiredAt" from outbox.event_retirements
           where tenant_id=$1::uuid and (event_id=$2::uuid or idempotency_key=$3)`,
  params: z.tuple([uuid, uuid, text]), row: retirement, expects: 'many',
});

export const insertRetirementReceipt = defineQuery({
  name: 'outbox.insertRetirementReceipt', text: sql`insert into outbox.event_retirements
             (tenant_id,event_id,idempotency_key,actor_id,reason,previous_status)
           values ($1::uuid,$2::uuid,$3,nullif(current_setting('app.actor_id',true),'')::uuid,$4,$5)
           returning id,tenant_id as "tenantId",event_id as "eventId",
  idempotency_key as "idempotencyKey",actor_id as "actorId",reason,
  previous_status as "previousStatus",retired_at as "retiredAt"`,
  params: z.tuple([uuid, uuid, text, text, status]), row: retirement, expects: 'many',
});

export const getRetirementReceipt = defineQuery({
  name: 'outbox.getRetirementReceipt', text: sql`select id,tenant_id as "tenantId",event_id as "eventId",
  idempotency_key as "idempotencyKey",actor_id as "actorId",reason,
  previous_status as "previousStatus",retired_at as "retiredAt" from outbox.event_retirements
       where tenant_id=$1::uuid and event_id=$2::uuid`,
  params: z.tuple([uuid, uuid]), row: retirement, expects: 'many',
});
