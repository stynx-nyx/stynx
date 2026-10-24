import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
const text = z.string();

export const beginOutboxStorageVerification = defineQuery({
  name: 'outbox.storage.beginVerification', text: sql`begin read only`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});
export const rollbackOutboxStorageVerification = defineQuery({
  name: 'outbox.storage.rollbackVerification', text: sql`rollback`,
  params: z.tuple([]), row: z.object({}), expects: 'none',
});

export const outboxStorageAdmission = defineQuery({
  name: 'outbox.storage.admission',
  text: sql`select current_user::text as owner,current_setting('transaction_read_only') as readonly`,
  params: z.tuple([]),
  row: z.object({ owner: text, readonly: text }),
  expects: 'many',
});

export const outboxStorageVisibility = defineQuery({
  name: 'outbox.storage.visibility',
  text: sql`select coalesce(bool_and(not row_security_active(c.oid)),false) as visible
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='outbox' and c.relkind in ('r','p')`,
  params: z.tuple([]),
  row: z.object({ visible: z.boolean() }),
  expects: 'many',
});

export const outboxStorageRoles = defineQuery({
  name: 'outbox.storage.roles',
  text: sql`select r.rolname as name,r.rolsuper as superuser,r.rolbypassrls as bypass,
        exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='outbox' and c.relowner=r.oid) as owns,
        pg_has_role(r.oid,$1::name,'MEMBER') as "ownerMember",
        exists(select 1 from pg_catalog.pg_roles p where (p.rolsuper or p.rolbypassrls)
          and pg_has_role(r.oid,p.oid,'MEMBER')) as "unsafeMembership"
       from pg_catalog.pg_roles r where r.rolname=$2 or r.rolname=$3`,
  params: z.tuple([text, text, text.nullable()]),
  row: z.object({ name: text, superuser: z.boolean(), bypass: z.boolean(), owns: z.boolean(), ownerMember: z.boolean(), unsafeMembership: z.boolean() }),
  expects: 'many',
});

export const outboxStorageSchema = defineQuery({
  name: 'outbox.storage.schema',
  text: sql`select pg_get_userbyid(nspowner) as owner from pg_catalog.pg_namespace where nspname='outbox'`,
  params: z.tuple([]),
  row: z.object({ owner: text }),
  expects: 'many',
});

export const outboxStorageApplicable = defineQuery({
  name: 'outbox.storage.applicable',
  text: sql`select rolname as name from pg_catalog.pg_roles where pg_has_role($1::name,oid,'MEMBER')
        or ($2::text is not null and pg_has_role($2::name,oid,'MEMBER'))`,
  params: z.tuple([text, text.nullable()]),
  row: z.object({ name: text }),
  expects: 'many',
});

export const outboxStoragePrivileges = defineQuery({
  name: 'outbox.storage.privileges',
  text: sql`with capabilities as (
        select role.name as role,member.rolname as member from (values ($1::text),($2::text)) role(name)
        join pg_catalog.pg_roles member on pg_has_role(role.name::name,member.oid,'MEMBER') where role.name is not null
      ), permissions as (
        select role.role,c.relname as object,null::text as parent,privilege.name as privilege,
          case when c.relkind='S' then has_sequence_privilege(role.member,c.oid,privilege.name)
            else has_table_privilege(role.member,c.oid,privilege.name) end as allowed,
          case when c.relkind='S' then has_sequence_privilege(role.member,c.oid,privilege.name||' WITH GRANT OPTION')
            else has_table_privilege(role.member,c.oid,privilege.name||' WITH GRANT OPTION') end as grantable
        from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
        cross join capabilities role
        cross join lateral unnest(case when c.relkind='S' then array['USAGE','SELECT','UPDATE']
          else array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] ||
            case when current_setting('server_version_num')::integer>=170000 then array['MAINTAIN'] else array[]::text[] end end) privilege(name)
        where n.nspname='outbox' and c.relkind in ('r','p','S')
        union all
        select role.role,c.relname||'.'||a.attname,c.relname,privilege.name,
          has_column_privilege(role.member,c.oid,a.attnum,privilege.name),
          has_column_privilege(role.member,c.oid,a.attnum,privilege.name||' WITH GRANT OPTION')
        from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
        join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join capabilities role
        cross join unnest(array['SELECT','INSERT','UPDATE','REFERENCES']) privilege(name)
        where n.nspname='outbox' and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped
        union all
        select role.role,'schema',null,privilege.name,has_schema_privilege(role.member,n.oid,privilege.name),
          has_schema_privilege(role.member,n.oid,privilege.name||' WITH GRANT OPTION')
        from pg_catalog.pg_namespace n cross join capabilities role
        cross join unnest(array['USAGE','CREATE']) privilege(name) where n.nspname='outbox'
        union all
        select role.role,p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',null,'EXECUTE',
          has_function_privilege(role.member,p.oid,'EXECUTE'),
          has_function_privilege(role.member,p.oid,'EXECUTE WITH GRANT OPTION') from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid=p.pronamespace cross join capabilities role where n.nspname='outbox'
        union all
        select role.role,'type:'||t.typname,null,'USAGE',has_type_privilege(role.member,t.oid,'USAGE'),
          has_type_privilege(role.member,t.oid,'USAGE WITH GRANT OPTION')
        from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace
        cross join capabilities role where n.nspname='outbox' and t.typtype='e'
      ) select role,object,parent,privilege,bool_or(allowed) as allowed,bool_or(grantable) as grantable from permissions
        group by role,object,parent,privilege`,
  params: z.tuple([text, text.nullable()]),
  row: z.object({ role: text, object: text, parent: text.nullable(), privilege: text, allowed: z.boolean(), grantable: z.boolean() }),
  expects: 'many',
});

export const outboxStorageEnforcement = defineQuery({
  name: 'outbox.storage.enforcement',
  text: sql`select coalesce(bool_and(t.tgenabled in ('O','A')),false) as valid
       from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       left join pg_catalog.pg_trigger t on t.tgconstraint=k.oid
       where n.nspname='outbox' and k.contype='f'`,
  params: z.tuple([]),
  row: z.object({ valid: z.boolean() }),
  expects: 'many',
});

export const outboxStorageMarker = defineQuery({
  name: 'outbox.storage.marker',
  text: sql`select count(*)=1 and bool_and(id and state in ('LEGACY','NEW') and generation>=0) as valid
       from outbox.legacy_ownership`,
  params: z.tuple([]),
  row: z.object({ valid: z.boolean() }),
  expects: 'many',
});

export const outboxStorageData = defineQuery({
  name: 'outbox.storage.data',
  text: sql`select tenant_id::text as "tenantId",'retirement-projection' as finding,count(*)::text as count
       from (select coalesce(d.tenant_id,r.tenant_id) as tenant_id from outbox.event_delivery d
         full join outbox.event_retirements r on r.tenant_id=d.tenant_id and r.event_id=d.event_id
         where (d.status='RETIRED') is distinct from (r.id is not null)
           or (d.status='RETIRED' and (d.lease_until is not null or d.next_attempt_at is not null))) invalid group by tenant_id
       union all
       select a.tenant_id::text,'legacy-ack-tenant',count(*)::text from outbox.acknowledgements a
         join outbox.messages m on m.id=a.message_id where a.tenant_id<>m.tenant_id group by a.tenant_id
       union all
       select m.tenant_id::text,'legacy-map-agreement',count(*)::text from outbox.messages m
         left join outbox.legacy_event_map l on l.legacy_id=m.id
         where (m.migrated_event_id is not null or l.legacy_id is not null)
           and (m.migrated_event_id is distinct from l.event_id
             or m.tenant_id is distinct from l.tenant_id
             or m.cutover_generation is distinct from l.generation) group by m.tenant_id
       union all
       select d.tenant_id::text,'legacy-delivery-agreement',count(*)::text from outbox.event_delivery d
         join outbox.messages m on m.id=d.legacy_id
         where d.event_id is distinct from m.migrated_event_id or d.tenant_id<>m.tenant_id group by d.tenant_id
       union all
       select l.tenant_id::text,'legacy-map-generation',count(*)::text from outbox.legacy_event_map l
         cross join outbox.legacy_ownership marker
         where marker.state<>'NEW' or l.generation<=0 or l.generation>marker.generation group by l.tenant_id
       union all
       select tenant_id::text,'negative-attempts',count(*)::text from outbox.event_delivery where attempts<0 group by tenant_id
       union all
       select tenant_id::text,'cursor-precision',count(*)::text from outbox.events
         where not isfinite(created_at) or created_at<>date_trunc('milliseconds',created_at) group by tenant_id
       union all
       select e.tenant_id::text,'cursor-clock',count(*)::text from outbox.events e
         left join outbox.tenant_clock c on c.tenant_id=e.tenant_id
         where c.tenant_id is null or not isfinite(e.created_at)
           or c.last_ms<extract(epoch from e.created_at)*1000 group by e.tenant_id
       union all
       select tenant_id::text,'cursor-clock-range',count(*)::text from outbox.tenant_clock
         where last_ms<0 or last_ms>281474976710655 group by tenant_id
       union all
       select e.tenant_id::text,'cursor-sequence',count(*)::text from outbox.events e
         join outbox.tenant_clock c on c.tenant_id=e.tenant_id
         cross join outbox.event_order_seq s
         cross join (select floor(extract(epoch from clock_timestamp())*1000)::bigint as now_ms) observation
         where extract(epoch from e.created_at)*1000=greatest(c.last_ms,observation.now_ms)
           and case when c.last_ms between 0 and 281474976710655
             and s.last_value::numeric+case when s.is_called then 1 else 0 end<=9223372036854775807
             then e.id>=outbox.event_uuid(greatest(c.last_ms,observation.now_ms),(s.last_value::numeric+case when s.is_called then 1 else 0 end)::bigint)
             else true end group by e.tenant_id`,
  params: z.tuple([]),
  row: z.object({ tenantId: text.nullable(), finding: text, count: text }),
  expects: 'many',
});

export const outboxStorageSequence = defineQuery({
  name: 'outbox.storage.sequence',
  text: sql`select last_value::numeric+case when is_called then 1 else 0 end<=9223372036854775807 as available
       from outbox.event_order_seq`,
  params: z.tuple([]),
  row: z.object({ available: z.boolean() }),
  expects: 'many',
});

