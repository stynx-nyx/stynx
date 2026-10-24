import { z } from 'zod';
import { defineQuery, sql } from './typed-query.js';

const schemaName = z.string().refine((value) => Buffer.byteLength(value, 'utf8') <= 63);
const integerText = z.string().regex(/^-?\d+$/u);

const catalogRelation = defineQuery({
  name: 'data.storage-catalog.relation',
  text: sql`select c.relname as name,jsonb_build_object(
      'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,
      'forceRls',c.relforcerowsecurity) as value
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname=$1 and c.relkind in ('r','p','S','v','m','f')`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ kind: z.string(), owner: z.string(), rls: z.boolean(), forceRls: z.boolean() }) }),
  expects: 'many',
});

const catalogColumn = defineQuery({
  name: 'data.storage-catalog.column',
  text: sql`select c.relname||'.'||a.attname as name,jsonb_build_object(
      'position',a.attnum,'typeSchema',tn.nspname,'type',t.typname,'typeModifier',a.atttypmod,
      'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,
      'collationSchema',cn.nspname,'collation',co.collname,
      'default',pg_get_expr(d.adbin,d.adrelid,false)) as value
    from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_type t on t.oid=a.atttypid join pg_catalog.pg_namespace tn on tn.oid=t.typnamespace
    left join pg_catalog.pg_collation co on co.oid=a.attcollation
    left join pg_catalog.pg_namespace cn on cn.oid=co.collnamespace
    left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
    where n.nspname=$1 and c.relkind in ('r','p') and a.attnum>0 and not a.attisdropped`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ position: z.number().int(), typeSchema: z.string(), type: z.string(), typeModifier: z.number().int(), notNull: z.boolean(), identity: z.string(), generated: z.string(), collationSchema: z.string().nullable(), collation: z.string().nullable(), default: z.string().nullable() }) }),
  expects: 'many',
});

const catalogConstraint = defineQuery({
  name: 'data.storage-catalog.constraint',
  text: sql`select c.relname||'.'||k.conname as name,jsonb_build_object(
      'kind',k.contype,'validated',k.convalidated,'deferrable',k.condeferrable,'deferred',k.condeferred,'noInherit',k.connoinherit,
      'columns',(select jsonb_agg(a.attname order by key.position) from unnest(k.conkey) with ordinality key(num,position)
        join pg_catalog.pg_attribute a on a.attrelid=k.conrelid and a.attnum=key.num),
      'expression',pg_get_expr(k.conbin,k.conrelid,false),'referencedSchema',rn.nspname,'referencedTable',r.relname,
      'referencedColumns',(select jsonb_agg(a.attname order by key.position) from unnest(k.confkey) with ordinality key(num,position)
        join pg_catalog.pg_attribute a on a.attrelid=k.confrelid and a.attnum=key.num),
      'onUpdate',k.confupdtype,'onDelete',k.confdeltype,'match',k.confmatchtype) as value
    from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    left join pg_catalog.pg_class r on r.oid=k.confrelid left join pg_catalog.pg_namespace rn on rn.oid=r.relnamespace
    where n.nspname=$1 and k.contype<>'n'`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ kind: z.string(), validated: z.boolean(), deferrable: z.boolean(), deferred: z.boolean(), noInherit: z.boolean(), columns: z.array(z.string()).nullable(), expression: z.string().nullable(), referencedSchema: z.string().nullable(), referencedTable: z.string().nullable(), referencedColumns: z.array(z.string()).nullable(), onUpdate: z.string(), onDelete: z.string(), match: z.string() }) }),
  expects: 'many',
});

const catalogIndex = defineQuery({
  name: 'data.storage-catalog.index',
  text: sql`select i.relname as name,jsonb_build_object(
      'table',c.relname,'definition',pg_get_indexdef(i.oid,0,false),'valid',x.indisvalid,
      'ready',x.indisready,'unique',x.indisunique,'primary',x.indisprimary) as value
    from pg_catalog.pg_index x join pg_catalog.pg_class i on i.oid=x.indexrelid
    join pg_catalog.pg_class c on c.oid=x.indrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname=$1`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ table: z.string(), definition: z.string(), valid: z.boolean(), ready: z.boolean(), unique: z.boolean(), primary: z.boolean() }) }),
  expects: 'many',
});

const catalogPolicy = defineQuery({
  name: 'data.storage-catalog.policy',
  text: sql`select c.relname||'.'||p.polname as name,jsonb_build_object(
      'command',p.polcmd,'permissive',p.polpermissive,
      'roles',(select jsonb_agg(case when role=0 then 'PUBLIC' else pg_get_userbyid(role) end order by role)
        from unnest(p.polroles) role),
      'using',pg_get_expr(p.polqual,p.polrelid,false),'check',pg_get_expr(p.polwithcheck,p.polrelid,false)) as value
    from pg_catalog.pg_policy p join pg_catalog.pg_class c on c.oid=p.polrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=$1`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ command: z.string(), permissive: z.boolean(), roles: z.array(z.string()), using: z.string().nullable(), check: z.string().nullable() }) }),
  expects: 'many',
});

const catalogTrigger = defineQuery({
  name: 'data.storage-catalog.trigger',
  text: sql`select c.relname||'.'||t.tgname as name,jsonb_build_object(
      'type',t.tgtype,'enabled',t.tgenabled,'functionSchema',fn.nspname,'function',f.proname,
      'arguments',encode(t.tgargs,'hex'),'condition',pg_get_expr(t.tgqual,t.tgrelid,false)) as value
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace join pg_catalog.pg_proc f on f.oid=t.tgfoid
    join pg_catalog.pg_namespace fn on fn.oid=f.pronamespace
    where n.nspname=$1 and not t.tgisinternal`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ type: z.number().int(), enabled: z.string(), functionSchema: z.string(), function: z.string(), arguments: z.string(), condition: z.string().nullable() }) }),
  expects: 'many',
});

const catalogFunction = defineQuery({
  name: 'data.storage-catalog.function',
  text: sql`select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' as name,
      jsonb_build_object('definition',pg_get_functiondef(p.oid),'owner',pg_get_userbyid(p.proowner),
        'securityDefiner',p.prosecdef,'config',p.proconfig,'volatility',p.provolatile,'strict',p.proisstrict,
        'parallel',p.proparallel,'leakproof',p.proleakproof) as value
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname=$1 and p.prokind='f'`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ definition: z.string(), owner: z.string(), securityDefiner: z.boolean(), config: z.array(z.string()).nullable(), volatility: z.string(), strict: z.boolean(), parallel: z.string(), leakproof: z.boolean() }) }),
  expects: 'many',
});

const catalogEnum = defineQuery({
  name: 'data.storage-catalog.enum',
  text: sql`select t.typname as name,jsonb_build_object('owner',pg_get_userbyid(t.typowner),
      'labels',jsonb_agg(e.enumlabel order by e.enumsortorder)) as value
    from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace
    join pg_catalog.pg_enum e on e.enumtypid=t.oid where n.nspname=$1 group by t.typname,t.typowner`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ owner: z.string(), labels: z.array(z.string()) }) }),
  expects: 'many',
});

const catalogSequence = defineQuery({
  name: 'data.storage-catalog.sequence',
  text: sql`select c.relname as name,jsonb_build_object(
      'type',s.seqtypid::regtype::text,'start',s.seqstart::text,'increment',s.seqincrement::text,
      'min',s.seqmin::text,'max',s.seqmax::text,'cache',s.seqcache::text,'cycle',s.seqcycle) as value
    from pg_catalog.pg_sequence s join pg_catalog.pg_class c on c.oid=s.seqrelid
    join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname=$1`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ type: z.string(), start: integerText, increment: integerText, min: integerText, max: integerText, cache: integerText, cycle: z.boolean() }) }),
  expects: 'many',
});

const catalogGrant = defineQuery({
  name: 'data.storage-catalog.grant',
  text: sql`select object||':'||grantee||':'||privilege_type as name,
      jsonb_build_object('object',object,'grantee',grantee,'privilege',privilege_type,'grantable',is_grantable) as value
    from (
      select c.relname as object,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end as grantee,
        x.privilege_type,x.is_grantable
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) x
      where n.nspname=$1 and c.relkind in ('r','p','S')
        and (x.privilege_type<>'MAINTAIN' or x.grantee<>c.relowner)
      union all
      select c.relname||'.'||a.attname,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable
      from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
      join pg_catalog.pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(a.attacl) x
      where n.nspname=$1 and a.attnum>0 and not a.attisdropped
      union all
      select 'schema',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable
      from pg_catalog.pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) x where n.nspname=$1
      union all
      select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable
      from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x where n.nspname=$1
      union all
      select 'type:'||t.typname,case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,x.privilege_type,x.is_grantable
      from pg_catalog.pg_type t join pg_catalog.pg_namespace n on n.oid=t.typnamespace
      cross join lateral aclexplode(coalesce(t.typacl,acldefault('T',t.typowner))) x where n.nspname=$1 and t.typtype='e'
    ) grants`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ object: z.string(), grantee: z.string(), privilege: z.string(), grantable: z.boolean() }) }),
  expects: 'many',
});

const catalogDefaultGrant = defineQuery({
  name: 'data.storage-catalog.default-grant',
  text: sql`select pg_get_userbyid(d.defaclrole)||':'||d.defaclobjtype::text||':'||
      case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end||':'||x.privilege_type as name,
      jsonb_build_object('owner',pg_get_userbyid(d.defaclrole),'kind',d.defaclobjtype,
        'grantee',case when x.grantee=0 then 'PUBLIC' else pg_get_userbyid(x.grantee) end,
        'privilege',x.privilege_type,'grantable',x.is_grantable) as value
      from pg_catalog.pg_default_acl d join pg_catalog.pg_namespace n on n.oid=d.defaclnamespace
      cross join lateral aclexplode(d.defaclacl) x where n.nspname=$1`,
  params: z.tuple([schemaName]),
  row: z.object({ name: z.string(), value: z.object({ owner: z.string(), kind: z.string(), grantee: z.string(), privilege: z.string(), grantable: z.boolean() }) }),
  expects: 'many',
});

export const storageCatalogQueries = Object.freeze([
  Object.freeze({ kind: 'relation', query: catalogRelation }),
  Object.freeze({ kind: 'column', query: catalogColumn }),
  Object.freeze({ kind: 'constraint', query: catalogConstraint }),
  Object.freeze({ kind: 'index', query: catalogIndex }),
  Object.freeze({ kind: 'policy', query: catalogPolicy }),
  Object.freeze({ kind: 'trigger', query: catalogTrigger }),
  Object.freeze({ kind: 'function', query: catalogFunction }),
  Object.freeze({ kind: 'enum', query: catalogEnum }),
  Object.freeze({ kind: 'sequence', query: catalogSequence }),
  Object.freeze({ kind: 'grant', query: catalogGrant }),
  Object.freeze({ kind: 'default-grant', query: catalogDefaultGrant }),
]);
