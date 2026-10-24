import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();

export const streamPrimaryAdmission = defineQuery({
  name: 'outbox.streamPrimaryAdmission', text: sql`select pg_is_in_recovery() as recovery,current_setting('app.role',true) as role,current_user as sql_role`,
  params: z.tuple([]), row: z.object({ recovery: z.boolean(), role: text.nullable(), sql_role: text }), expects: 'many',
});

export const streamLockTimeout = defineQuery({
  name: 'outbox.streamLockTimeout', text: sql`select set_config('lock_timeout',$1,true)`,
  params: z.tuple([text]), row: z.object({ set_config: text }), expects: 'many',
});

export const streamClock = defineQuery({
  name: 'outbox.streamClock', text: sql`insert into outbox.tenant_clock (tenant_id,last_ms)
               values (nullif(current_setting('app.tenant_id',true),'')::uuid,
                       greatest(0,floor(extract(epoch from clock_timestamp())*1000)::bigint))
             on conflict (tenant_id) do update
               set last_ms=greatest(outbox.tenant_clock.last_ms,excluded.last_ms)
             returning last_ms::text`,
  params: z.tuple([]), row: z.object({ last_ms: text }), expects: 'many',
});


const streamTimestamp = z.union([z.instanceof(Date), text, z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
const streamRow = z.object({ id: text, createdAt: streamTimestamp, event: text, payload: z.record(text, z.json()) });

export const streamFindById = defineQuery({ name: 'outbox.streamFindById', text: sql`select e.id,e.created_at as "createdAt",e.entity as event,e.payload
           from outbox.events e
          where e.tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
            and e.id=coalesce((select m.event_id from outbox.legacy_event_map m
                                where m.tenant_id=e.tenant_id and m.legacy_id=$1::uuid),$1::uuid)
          limit 1`,
 params: z.tuple([text]), row: streamRow, expects: 'many' });

export const streamListSince = defineQuery({ name: 'outbox.streamListSince', text: sql`select id,created_at as "createdAt",entity as event,payload
           from outbox.events
          where tenant_id=nullif(current_setting('app.tenant_id',true),'')::uuid
            and (created_at>$1::timestamptz or (created_at=$1::timestamptz
                 and ($2='' or id>nullif($2,'')::uuid)))
          order by created_at,id limit $3`,
 params: z.tuple([z.instanceof(Date), text, z.custom<number>((value) => typeof value === 'number')]), row: streamRow, expects: 'many' });
