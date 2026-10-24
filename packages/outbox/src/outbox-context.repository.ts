import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();

export const checkApplicationOwnership = defineQuery({name:'outbox.checkApplicationOwnership',text:sql`select c.relname as relation, o.rolname::text as owner,
                  (a.oid = c.relowner) as owns,
                  pg_catalog.pg_has_role(a.oid, c.relowner, 'MEMBER') as member
             from pg_catalog.pg_class c
             join pg_catalog.pg_namespace n on n.oid = c.relnamespace
             join pg_catalog.pg_roles o on o.oid = c.relowner
             left join pg_catalog.pg_roles a on a.rolname = $1
            where n.nspname = 'outbox' and c.relname = any($2::text[])
            order by c.relname`,params:z.tuple([text,z.array(text)]),row:z.object({ relation:text,owner:text,owns:z.boolean().nullable(),member:z.boolean().nullable() }),expects:'many'});

export const readAppendContext = defineQuery({name:'outbox.readAppendContext',text:sql`select nullif(current_setting('app.tenant_id',true),'')::uuid::text as tenant_id,
              current_setting('app.role',true) as role,
              current_user as sql_role,
              current_setting('transaction_isolation') as isolation,
              current_setting('transaction_read_only') as read_only,
              pg_is_in_recovery() as recovery`,params:z.tuple([]),row:z.object({ tenant_id:text.nullable(),role:text.nullable(),sql_role:text,isolation:text,read_only:text,recovery:z.boolean() }),expects:'many'});

export const readLockTimeout = defineQuery({name:'outbox.readLockTimeout',text:sql`select current_setting('lock_timeout') as value`,params:z.tuple([]),row:z.object({value:text}),expects:'many'});

export const readAuditChainKey = defineQuery({name:'outbox.readAuditChainKey',text:sql`select nullif(current_setting('stynx.audit_chain_key',true),'') as key`,params:z.tuple([]),row:z.object({key:text.nullable()}),expects:'many'});

export const advanceAppendClock = defineQuery({name:'outbox.advanceAppendClock',text:sql`insert into outbox.tenant_clock (tenant_id,last_ms)
         values ($1,greatest(0,floor(extract(epoch from clock_timestamp()) * 1000)::bigint))
         on conflict (tenant_id) do update
           set last_ms = greatest(outbox.tenant_clock.last_ms,excluded.last_ms)
         returning last_ms::text`,params:z.tuple([text]),row:z.object({last_ms:text}),expects:'many'});

export const auditContractAvailable = defineQuery({name:'outbox.auditContractAvailable',text:sql`select to_regprocedure('audit.fn_row_change()') is not null as available`,params:z.tuple([]),row:z.object({available:z.boolean()}),expects:'many'});

export const lockOwnershipMarker = defineQuery({name:'outbox.lockOwnershipMarker',text:sql`select state,generation::text from outbox.legacy_ownership where id=true for update`,params:z.tuple([]),row:z.object({state:z.enum(['LEGACY','NEW']),generation:text}),expects:'many'});

export const countLegacyEventMap = defineQuery({name:'outbox.countLegacyEventMap',text:sql`select count(*)::text as count from outbox.legacy_event_map`,params:z.tuple([]),row:z.object({count:text}),expects:'many'});

export const setLockTimeout = defineQuery({name:'outbox.setLockTimeout',text:sql`select set_config('lock_timeout',$1,true)`,params:z.tuple([text]),row:z.object({set_config:text}),expects:'many'});

export const setAuditChainKey = defineQuery({name:'outbox.setAuditChainKey',text:sql`select set_config('stynx.audit_chain_key',$1,true)`,params:z.tuple([text]),row:z.object({set_config:text}),expects:'many'});

export const lockAuditChain = defineQuery({name:'outbox.lockAuditChain',text:sql`select pg_advisory_xact_lock(hashtextextended($1,0))`,params:z.tuple([text]),row:z.object({pg_advisory_xact_lock:text.nullable()}),expects:'many'});

export const enterItemReadOnly = defineQuery({name:'outbox.enterItemReadOnly',text:sql`set local transaction_read_only = on`,params:z.tuple([]),row:z.object({}),expects:'none'});
export const readOwnershipWaiting = defineQuery({name:'outbox.readOwnershipWaiting',text:sql`select state from outbox.legacy_ownership where id = true for share `,params:z.tuple([]),row:z.object({state:z.enum(['LEGACY','NEW'])}),expects:'many'});
export const readOwnershipNowait = defineQuery({name:'outbox.readOwnershipNowait',text:sql`select state from outbox.legacy_ownership where id = true for share nowait`,params:z.tuple([]),row:z.object({state:z.enum(['LEGACY','NEW'])}),expects:'many'});

export const cutoverLockQueries = [
 defineQuery({name:'outbox.cutoverLock.messages',text:sql`lock table outbox.messages in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.events',text:sql`lock table outbox.events in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.event_delivery',text:sql`lock table outbox.event_delivery in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.legacy_event_map',text:sql`lock table outbox.legacy_event_map in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.event_attempts',text:sql`lock table outbox.event_attempts in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.event_acks',text:sql`lock table outbox.event_acks in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.tenant_clock',text:sql`lock table outbox.tenant_clock in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
 defineQuery({name:'outbox.cutoverLock.legacy_ownership',text:sql`lock table outbox.legacy_ownership in share row exclusive mode`,params:z.tuple([]),row:z.object({}),expects:'none'}),
] as const;

export const cutoverAuditedRelations = defineQuery({name:'outbox.cutoverAuditedRelations',text:sql`with recursive target(oid) as (
           select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='outbox' and c.relname=any($1::text[])
           union all
           select i.inhrelid from pg_inherits i join target t on t.oid=i.inhparent
         )
         select distinct c.relname from pg_trigger t
           join target x on x.oid=t.tgrelid join pg_class c on c.oid=t.tgrelid
          where t.tgfoid='audit.fn_row_change()'::regprocedure and t.tgenabled<>'D'`,params:z.tuple([z.array(text)]),row:z.object({relname:text}),expects:'many'});
