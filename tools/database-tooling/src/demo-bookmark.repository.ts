import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

function isStringArray(value: unknown): value is string[] {
  if (!Array.isArray(value)) return false;
  const rows: unknown[] = value;
  const count = rows.length;
  for (let index = 0; index < count; index += 1) {
    const entry = rows[index];
    if (!(typeof entry === 'string')) return false;
  }
  return true;
}

function isBooleanArray(value: unknown): value is boolean[] {
  if (!Array.isArray(value)) return false;
  const rows: unknown[] = value;
  const count = rows.length;
  for (let index = 0; index < count; index += 1) {
    const entry = rows[index];
    if (!(typeof entry === 'boolean')) return false;
  }
  return true;
}

function isIntegerArray(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  const rows: unknown[] = value;
  const count = rows.length;
  for (let index = 0; index < count; index += 1) {
    const entry = rows[index];
    if (!((typeof entry === 'number' && Number.isInteger(entry)))) return false;
  }
  return true;
}

export const demoBookmarkServerVersion = defineQuery({
  name: 'tooling.demo-bookmark.server-version',
  text: sql`select current_setting('server_version_num')::integer as version`,
  params: z.tuple([]),
  row: z.object({ version: z.number().refine(Number.isInteger) }),
  expects: 'many',
});

export const demoBookmarkFixedRoles = defineQuery({
  name: 'tooling.demo-bookmark.fixed-roles',
  text: sql`select rolname, rolcanlogin, rolsuper, rolbypassrls,
    rolcreaterole, rolcreatedb, rolreplication from pg_catalog.pg_roles
    where rolname = any($1::text[]) order by rolname`,
  params: z.tuple([z.array(z.string())]),
  row: z.object({
    rolname: z.string(), rolcanlogin: z.boolean(), rolsuper: z.boolean(),
    rolbypassrls: z.boolean(), rolcreaterole: z.boolean(),
    rolcreatedb: z.boolean(), rolreplication: z.boolean(),
  }),
  expects: 'many',
});

export interface DemoBookmarkServerVersionRow { version: number }
export interface DemoBookmarkRoleRow {
  rolname: string;
  rolcanlogin: boolean;
  rolsuper: boolean;
  rolbypassrls: boolean;
  rolcreaterole: boolean;
  rolcreatedb: boolean;
  rolreplication: boolean;
}

export function isDemoBookmarkServerVersionRow(value: unknown): value is DemoBookmarkServerVersionRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'version' in value && typeof value.version === 'number' && Number.isInteger(value.version);
}

export function isDemoBookmarkRoleRow(value: unknown): value is DemoBookmarkRoleRow {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'rolname' in value && typeof value.rolname === 'string' &&
    'rolcanlogin' in value && typeof value.rolcanlogin === 'boolean' &&
    'rolsuper' in value && typeof value.rolsuper === 'boolean' &&
    'rolbypassrls' in value && typeof value.rolbypassrls === 'boolean' &&
    'rolcreaterole' in value && typeof value.rolcreaterole === 'boolean' &&
    'rolcreatedb' in value && typeof value.rolcreatedb === 'boolean' &&
    'rolreplication' in value && typeof value.rolreplication === 'boolean';
}

export const demoBookmarkMemberships = defineQuery({
  name: 'tooling.demo-bookmark.memberships',
  text: sql`select actor.rolname as actor, target.rolname as target
    from pg_catalog.pg_roles actor cross join pg_catalog.pg_roles target
    where actor.rolname in ('stynx_app','stynx_reader') and actor.oid <> target.oid
      and pg_catalog.pg_has_role(actor.oid, target.oid, 'MEMBER')
      and (target.rolname='stynx_owner' or target.rolsuper or target.rolbypassrls
        or target.rolcreaterole or target.rolcreatedb or target.rolreplication
        or (actor.rolname='stynx_reader' and target.rolname='stynx_app'))
    order by actor.rolname,target.rolname`,
  params: z.tuple([]),
  row: z.object({
    actor: z.string(),
    target: z.string(),
  }),
  expects: 'many',
});

export function isDemoBookmarkMembershipsRow(value: unknown): value is z.output<typeof demoBookmarkMemberships.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'actor' in value && typeof value.actor === 'string' &&
    'target' in value && typeof value.target === 'string';
}

export const demoBookmarkSchemaGrants = defineQuery({
  name: 'tooling.demo-bookmark.schema-grants',
  text: sql`select pg_catalog.pg_get_userbyid(nspowner) as owner,
    has_schema_privilege('stynx_app',oid,'USAGE') as app_usage,
    has_schema_privilege('stynx_app',oid,'CREATE') as app_create,
    has_schema_privilege('stynx_reader',oid,'USAGE') as reader_usage,
    has_schema_privilege('stynx_reader',oid,'CREATE') as reader_create,
    has_schema_privilege('public',oid,'USAGE,CREATE') as public_access
    from pg_catalog.pg_namespace where nspname='demo'`,
  params: z.tuple([]),
  row: z.object({
    owner: z.string(),
    app_usage: z.boolean(),
    app_create: z.boolean(),
    reader_usage: z.boolean(),
    reader_create: z.boolean(),
    public_access: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkSchemaGrantsRow(value: unknown): value is z.output<typeof demoBookmarkSchemaGrants.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'owner' in value && typeof value.owner === 'string' &&
    'app_usage' in value && typeof value.app_usage === 'boolean' &&
    'app_create' in value && typeof value.app_create === 'boolean' &&
    'reader_usage' in value && typeof value.reader_usage === 'boolean' &&
    'reader_create' in value && typeof value.reader_create === 'boolean' &&
    'public_access' in value && typeof value.public_access === 'boolean';
}

export const demoBookmarkSetRoleSchema = defineQuery({
  name: 'tooling.demo-bookmark.set-role-schema',
  text: sql`with targets as (select actor.rolname::text as actor, target.rolname::text as target
  from pg_catalog.pg_roles actor cross join pg_catalog.pg_roles target
  where actor.rolname in ('stynx_app','stynx_reader') and actor.oid<>target.oid
    and pg_catalog.pg_has_role(actor.oid,target.oid,'SET'))
    select actor,target,pg_catalog.has_schema_privilege(target,'demo','CREATE') as can_create,
      pg_catalog.has_schema_privilege(target,'demo','USAGE WITH GRANT OPTION,CREATE WITH GRANT OPTION') as grantable
    from targets order by actor,target`,
  params: z.tuple([]),
  row: z.object({
    actor: z.string(),
    target: z.string(),
    can_create: z.boolean(),
    grantable: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkSetRoleSchemaRow(value: unknown): value is z.output<typeof demoBookmarkSetRoleSchema.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'actor' in value && typeof value.actor === 'string' &&
    'target' in value && typeof value.target === 'string' &&
    'can_create' in value && typeof value.can_create === 'boolean' &&
    'grantable' in value && typeof value.grantable === 'boolean';
}

export const demoBookmarkRelations = defineQuery({
  name: 'tooling.demo-bookmark.relations',
  text: sql`select c.relname,c.relkind,pg_catalog.pg_get_userbyid(c.relowner) as owner,
    c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relpersistence
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    where n.nspname='demo' and c.relkind not in ('i','I') order by c.relname`,
  params: z.tuple([]),
  row: z.object({
    relname: z.string(),
    relkind: z.string(),
    owner: z.string(),
    relrowsecurity: z.boolean(),
    relforcerowsecurity: z.boolean(),
    relispartition: z.boolean(),
    relpersistence: z.string(),
  }),
  expects: 'many',
});

export function isDemoBookmarkRelationsRow(value: unknown): value is z.output<typeof demoBookmarkRelations.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'relname' in value && typeof value.relname === 'string' &&
    'relkind' in value && typeof value.relkind === 'string' &&
    'owner' in value && typeof value.owner === 'string' &&
    'relrowsecurity' in value && typeof value.relrowsecurity === 'boolean' &&
    'relforcerowsecurity' in value && typeof value.relforcerowsecurity === 'boolean' &&
    'relispartition' in value && typeof value.relispartition === 'boolean' &&
    'relpersistence' in value && typeof value.relpersistence === 'string';
}

export const demoBookmarkRoutines = defineQuery({
  name: 'tooling.demo-bookmark.routines',
  text: sql`select p.oid::regprocedure::text as routine,
    p.prokind,p.prosecdef,pg_catalog.pg_get_userbyid(p.proowner) as owner
    from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='demo' order by p.oid`,
  params: z.tuple([]),
  row: z.object({
    routine: z.string(),
    prokind: z.string(),
    prosecdef: z.boolean(),
    owner: z.string(),
  }),
  expects: 'many',
});

export function isDemoBookmarkRoutinesRow(value: unknown): value is z.output<typeof demoBookmarkRoutines.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'routine' in value && typeof value.routine === 'string' &&
    'prokind' in value && typeof value.prokind === 'string' &&
    'prosecdef' in value && typeof value.prosecdef === 'boolean' &&
    'owner' in value && typeof value.owner === 'string';
}

export const demoBookmarkInheritance = defineQuery({
  name: 'tooling.demo-bookmark.inheritance',
  text: sql`select inhrelid::regclass::text as child,
    inhparent::regclass::text as parent from pg_catalog.pg_inherits
    where inhrelid in (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='demo' and c.relname=any($1::text[]))
       or inhparent in (select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='demo' and c.relname=any($1::text[]))`,
  params: z.tuple([z.array(z.string())]),
  row: z.object({
    child: z.string(),
    parent: z.string(),
  }),
  expects: 'many',
});

export function isDemoBookmarkInheritanceRow(value: unknown): value is z.output<typeof demoBookmarkInheritance.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'child' in value && typeof value.child === 'string' &&
    'parent' in value && typeof value.parent === 'string';
}

export const demoBookmarkPiiRegistration = defineQuery({
  name: 'tooling.demo-bookmark.pii-registration',
  text: sql`select table_schema,table_name,column_name,category,strategy,
    legal_basis,retention,notes from core.pii_map where table_schema='demo'
    and table_name=any($1::text[]) order by table_name,column_name`,
  params: z.tuple([z.array(z.string())]),
  row: z.object({
    table_schema: z.string(),
    table_name: z.string(),
    column_name: z.string(),
    category: z.string().nullable(),
    strategy: z.string(),
    legal_basis: z.string().nullable(),
    retention: z.string().nullable(),
    notes: z.string().nullable(),
  }),
  expects: 'many',
});

export function isDemoBookmarkPiiRegistrationRow(value: unknown): value is z.output<typeof demoBookmarkPiiRegistration.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'table_schema' in value && typeof value.table_schema === 'string' &&
    'table_name' in value && typeof value.table_name === 'string' &&
    'column_name' in value && typeof value.column_name === 'string' &&
    'category' in value && (value.category === null || typeof value.category === 'string') &&
    'strategy' in value && typeof value.strategy === 'string' &&
    'legal_basis' in value && (value.legal_basis === null || typeof value.legal_basis === 'string') &&
    'retention' in value && (value.retention === null || typeof value.retention === 'string') &&
    'notes' in value && (value.notes === null || typeof value.notes === 'string');
}

export const demoBookmarkRelationExistence = defineQuery({
  name: 'tooling.demo-bookmark.relation-existence',
  text: sql`select to_regclass($1)::text as name`,
  params: z.tuple([z.string()]),
  row: z.object({
    name: z.string().nullable(),
  }),
  expects: 'many',
});

export function isDemoBookmarkRelationExistenceRow(value: unknown): value is z.output<typeof demoBookmarkRelationExistence.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'name' in value && (value.name === null || typeof value.name === 'string');
}

export const demoBookmarkAttributes = defineQuery({
  name: 'tooling.demo-bookmark.attributes',
  text: sql`select a.attname,pg_catalog.format_type(a.atttypid,a.atttypmod) as type,
      a.attnotnull,pg_catalog.pg_get_expr(d.adbin,d.adrelid) as expression,
      a.attidentity,a.attgenerated,(a.attcollation=t.typcollation) as default_collation
      from pg_catalog.pg_attribute a join pg_catalog.pg_type t on t.oid=a.atttypid
      left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by a.attnum`,
  params: z.tuple([z.string()]),
  row: z.object({
    attname: z.string(),
    type: z.string(),
    attnotnull: z.boolean(),
    expression: z.string().nullable(),
    attidentity: z.string(),
    attgenerated: z.string(),
    default_collation: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkAttributesRow(value: unknown): value is z.output<typeof demoBookmarkAttributes.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'attname' in value && typeof value.attname === 'string' &&
    'type' in value && typeof value.type === 'string' &&
    'attnotnull' in value && typeof value.attnotnull === 'boolean' &&
    'expression' in value && (value.expression === null || typeof value.expression === 'string') &&
    'attidentity' in value && typeof value.attidentity === 'string' &&
    'attgenerated' in value && typeof value.attgenerated === 'string' &&
    'default_collation' in value && typeof value.default_collation === 'boolean';
}

export const demoBookmarkConstraints = defineQuery({
  name: 'tooling.demo-bookmark.constraints',
  text: sql`select contype,pg_catalog.pg_get_constraintdef(oid,true) as definition,
      convalidated,condeferrable,condeferred,connoinherit from pg_catalog.pg_constraint where conrelid=$1::regclass`,
  params: z.tuple([z.string()]),
  row: z.object({
    contype: z.string(),
    definition: z.string(),
    convalidated: z.boolean(),
    condeferrable: z.boolean(),
    condeferred: z.boolean(),
    connoinherit: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkConstraintsRow(value: unknown): value is z.output<typeof demoBookmarkConstraints.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'contype' in value && typeof value.contype === 'string' &&
    'definition' in value && typeof value.definition === 'string' &&
    'convalidated' in value && typeof value.convalidated === 'boolean' &&
    'condeferrable' in value && typeof value.condeferrable === 'boolean' &&
    'condeferred' in value && typeof value.condeferred === 'boolean' &&
    'connoinherit' in value && typeof value.connoinherit === 'boolean';
}

export const demoBookmarkIndexes = defineQuery({
  name: 'tooling.demo-bookmark.indexes',
  text: sql`select c.relname,i.indisunique,i.indisprimary,i.indisvalid,i.indisready,
      i.indnkeyatts,i.indnatts,am.amname,i.indnullsnotdistinct,
      i.indexprs is null as no_expressions,
      array(select option from unnest(i.indoption) option) as options,
      array(select op.opcdefault from unnest(i.indclass) with ordinality key(oid,position)
        join pg_catalog.pg_opclass op on op.oid=key.oid order by key.position) as default_opclasses,
      array(select key_collation.oid=a.attcollation from unnest(i.indcollation) with ordinality key_collation(oid,position)
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=i.indkey[key_collation.position::integer-1]
        order by key_collation.position) as key_collations_match,
      pg_catalog.pg_get_expr(i.indpred,i.indrelid) as predicate,
      array(select a.attname::text from unnest(i.indkey) with ordinality key(attnum,position)
        join pg_catalog.pg_attribute a on a.attrelid=i.indrelid and a.attnum=key.attnum order by key.position) as columns
      from pg_catalog.pg_index i join pg_catalog.pg_class c on c.oid=i.indexrelid
      join pg_catalog.pg_am am on am.oid=c.relam where i.indrelid=$1::regclass order by c.relname`,
  params: z.tuple([z.string()]),
  row: z.object({
    relname: z.string(),
    indisunique: z.boolean(),
    indisprimary: z.boolean(),
    indisvalid: z.boolean(),
    indisready: z.boolean(),
    indnkeyatts: z.number().refine(Number.isInteger),
    indnatts: z.number().refine(Number.isInteger),
    amname: z.string(),
    indnullsnotdistinct: z.boolean(),
    no_expressions: z.boolean(),
    options: z.array(z.number().refine(Number.isInteger)),
    default_opclasses: z.array(z.boolean()),
    key_collations_match: z.array(z.boolean()),
    predicate: z.string().nullable(),
    columns: z.array(z.string()),
  }),
  expects: 'many',
});

export function isDemoBookmarkIndexesRow(value: unknown): value is z.output<typeof demoBookmarkIndexes.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'relname' in value && typeof value.relname === 'string' &&
    'indisunique' in value && typeof value.indisunique === 'boolean' &&
    'indisprimary' in value && typeof value.indisprimary === 'boolean' &&
    'indisvalid' in value && typeof value.indisvalid === 'boolean' &&
    'indisready' in value && typeof value.indisready === 'boolean' &&
    'indnkeyatts' in value && (typeof value.indnkeyatts === 'number' && Number.isInteger(value.indnkeyatts)) &&
    'indnatts' in value && (typeof value.indnatts === 'number' && Number.isInteger(value.indnatts)) &&
    'amname' in value && typeof value.amname === 'string' &&
    'indnullsnotdistinct' in value && typeof value.indnullsnotdistinct === 'boolean' &&
    'no_expressions' in value && typeof value.no_expressions === 'boolean' &&
    'options' in value && isIntegerArray(value.options) &&
    'default_opclasses' in value && isBooleanArray(value.default_opclasses) &&
    'key_collations_match' in value && isBooleanArray(value.key_collations_match) &&
    'predicate' in value && (value.predicate === null || typeof value.predicate === 'string') &&
    'columns' in value && isStringArray(value.columns);
}

export const demoBookmarkPolicies = defineQuery({
  name: 'tooling.demo-bookmark.policies',
  text: sql`select polname,polcmd,polpermissive,cardinality(polroles) as role_count,
      array(select r.rolname::text from unnest(p.polroles) role(oid) join pg_catalog.pg_roles r on r.oid=role.oid order by r.rolname) as roles,
      pg_catalog.pg_get_expr(polqual,polrelid) as using_expression,
      pg_catalog.pg_get_expr(polwithcheck,polrelid) as check_expression
      from pg_catalog.pg_policy p where polrelid=$1::regclass order by polname`,
  params: z.tuple([z.string()]),
  row: z.object({
    polname: z.string(),
    polcmd: z.string(),
    polpermissive: z.boolean(),
    role_count: z.number().refine(Number.isInteger),
    roles: z.array(z.string()),
    using_expression: z.string().nullable(),
    check_expression: z.string().nullable(),
  }),
  expects: 'many',
});

export function isDemoBookmarkPoliciesRow(value: unknown): value is z.output<typeof demoBookmarkPolicies.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'polname' in value && typeof value.polname === 'string' &&
    'polcmd' in value && typeof value.polcmd === 'string' &&
    'polpermissive' in value && typeof value.polpermissive === 'boolean' &&
    'role_count' in value && (typeof value.role_count === 'number' && Number.isInteger(value.role_count)) &&
    'roles' in value && isStringArray(value.roles) &&
    'using_expression' in value && (value.using_expression === null || typeof value.using_expression === 'string') &&
    'check_expression' in value && (value.check_expression === null || typeof value.check_expression === 'string');
}

export const demoBookmarkGrants = defineQuery({
  name: 'tooling.demo-bookmark.grants',
  text: sql`select role,privilege,
      pg_catalog.has_table_privilege(role,$1,privilege) as allowed,
      pg_catalog.has_table_privilege(role,$1,privilege || ' WITH GRANT OPTION') as grantable
      from unnest($2::text[]) role cross join unnest($3::text[]) privilege order by role,privilege`,
  params: z.tuple([z.string(), z.array(z.string()), z.array(z.string())]),
  row: z.object({
    role: z.string(),
    privilege: z.string(),
    allowed: z.boolean(),
    grantable: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkGrantsRow(value: unknown): value is z.output<typeof demoBookmarkGrants.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'role' in value && typeof value.role === 'string' &&
    'privilege' in value && typeof value.privilege === 'string' &&
    'allowed' in value && typeof value.allowed === 'boolean' &&
    'grantable' in value && typeof value.grantable === 'boolean';
}

export const demoBookmarkColumnGrants = defineQuery({
  name: 'tooling.demo-bookmark.column-grants',
  text: sql`select role,a.attname,privilege,
      pg_catalog.has_column_privilege(role,a.attrelid,a.attnum,privilege) as allowed,
      pg_catalog.has_column_privilege(role,a.attrelid,a.attnum,privilege || ' WITH GRANT OPTION') as grantable
      from pg_catalog.pg_attribute a cross join unnest($2::text[]) role cross join unnest($3::text[]) privilege
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped order by role,a.attnum,privilege`,
  params: z.tuple([z.string(), z.array(z.string()), z.array(z.string())]),
  row: z.object({
    role: z.string(),
    attname: z.string(),
    privilege: z.string(),
    allowed: z.boolean(),
    grantable: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkColumnGrantsRow(value: unknown): value is z.output<typeof demoBookmarkColumnGrants.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'role' in value && typeof value.role === 'string' &&
    'attname' in value && typeof value.attname === 'string' &&
    'privilege' in value && typeof value.privilege === 'string' &&
    'allowed' in value && typeof value.allowed === 'boolean' &&
    'grantable' in value && typeof value.grantable === 'boolean';
}

export const demoBookmarkSetRoleTableGrants = defineQuery({
  name: 'tooling.demo-bookmark.set-role-table-grants',
  text: sql`with targets as (select actor.rolname::text as actor, target.rolname::text as target
  from pg_catalog.pg_roles actor cross join pg_catalog.pg_roles target
  where actor.rolname in ('stynx_app','stynx_reader') and actor.oid<>target.oid
    and pg_catalog.pg_has_role(actor.oid,target.oid,'SET'))
      select actor,target,privilege,
        pg_catalog.has_table_privilege(target,$1,privilege) as allowed,
        pg_catalog.has_table_privilege(target,$1,privilege || ' WITH GRANT OPTION') as grantable
      from targets cross join unnest($2::text[]) privilege order by actor,target,privilege`,
  params: z.tuple([z.string(), z.array(z.string())]),
  row: z.object({
    actor: z.string(),
    target: z.string(),
    privilege: z.string(),
    allowed: z.boolean(),
    grantable: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkSetRoleTableGrantsRow(value: unknown): value is z.output<typeof demoBookmarkSetRoleTableGrants.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'actor' in value && typeof value.actor === 'string' &&
    'target' in value && typeof value.target === 'string' &&
    'privilege' in value && typeof value.privilege === 'string' &&
    'allowed' in value && typeof value.allowed === 'boolean' &&
    'grantable' in value && typeof value.grantable === 'boolean';
}

export const demoBookmarkSetRoleColumnGrants = defineQuery({
  name: 'tooling.demo-bookmark.set-role-column-grants',
  text: sql`with targets as (select actor.rolname::text as actor, target.rolname::text as target
  from pg_catalog.pg_roles actor cross join pg_catalog.pg_roles target
  where actor.rolname in ('stynx_app','stynx_reader') and actor.oid<>target.oid
    and pg_catalog.pg_has_role(actor.oid,target.oid,'SET'))
      select actor,target,a.attname,privilege,
        pg_catalog.has_column_privilege(target,a.attrelid,a.attnum,privilege) as allowed,
        pg_catalog.has_column_privilege(target,a.attrelid,a.attnum,privilege || ' WITH GRANT OPTION') as grantable
      from targets cross join pg_catalog.pg_attribute a cross join unnest($2::text[]) privilege
      where a.attrelid=$1::regclass and a.attnum>0 and not a.attisdropped
      order by actor,target,a.attnum,privilege`,
  params: z.tuple([z.string(), z.array(z.string())]),
  row: z.object({
    actor: z.string(),
    target: z.string(),
    attname: z.string(),
    privilege: z.string(),
    allowed: z.boolean(),
    grantable: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkSetRoleColumnGrantsRow(value: unknown): value is z.output<typeof demoBookmarkSetRoleColumnGrants.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'actor' in value && typeof value.actor === 'string' &&
    'target' in value && typeof value.target === 'string' &&
    'attname' in value && typeof value.attname === 'string' &&
    'privilege' in value && typeof value.privilege === 'string' &&
    'allowed' in value && typeof value.allowed === 'boolean' &&
    'grantable' in value && typeof value.grantable === 'boolean';
}

export const demoBookmarkTriggers = defineQuery({
  name: 'tooling.demo-bookmark.triggers',
  text: sql`select tgname from pg_catalog.pg_trigger where tgrelid=$1::regclass and not tgisinternal`,
  params: z.tuple([z.string()]),
  row: z.object({
    tgname: z.string(),
  }),
  expects: 'many',
});

export function isDemoBookmarkTriggersRow(value: unknown): value is z.output<typeof demoBookmarkTriggers.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'tgname' in value && typeof value.tgname === 'string';
}

export const demoBookmarkRules = defineQuery({
  name: 'tooling.demo-bookmark.rules',
  text: sql`select rulename from pg_catalog.pg_rewrite where ev_class=$1::regclass`,
  params: z.tuple([z.string()]),
  row: z.object({
    rulename: z.string(),
  }),
  expects: 'many',
});

export function isDemoBookmarkRulesRow(value: unknown): value is z.output<typeof demoBookmarkRules.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'rulename' in value && typeof value.rulename === 'string';
}

export const demoBookmarkInstallerAdmission = defineQuery({
  name: 'tooling.demo-bookmark.installer-admission',
  text: sql`select current_user::text as actor,
    to_regnamespace('demo') is not null as schema_exists`,
  params: z.tuple([]),
  row: z.object({
    actor: z.string(),
    schema_exists: z.boolean(),
  }),
  expects: 'many',
});

export function isDemoBookmarkInstallerAdmissionRow(value: unknown): value is z.output<typeof demoBookmarkInstallerAdmission.row> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) &&
    'actor' in value && typeof value.actor === 'string' &&
    'schema_exists' in value && typeof value.schema_exists === 'boolean';
}
