import { createHash } from 'node:crypto';
import {
  collectStorageCatalog,
  quoteStorageIdentifier,
  resolveStorageRoleBinding,
} from '@stynx-nyx/data';
import type {
  StorageBindingOptions,
  StorageCatalogEntry,
  StorageRoleBinding,
  StorageVerificationCheck,
  StorageVerificationReport,
  StorageVerifierTransaction,
} from '@stynx-nyx/data';
import { OUTBOX_STORAGE_TEMPLATE } from './storage-template.generated';
import { OUTBOX_STORAGE_CATALOG } from './storage-catalog.generated';

export type OutboxStorageOptions = StorageBindingOptions;
export interface OutboxStorageManifest {
  contractVersion: string;
  packageVersion: string;
  sources: readonly { path: string; sha256: string }[];
  catalog: readonly StorageCatalogEntry[];
  dependencies: readonly string[];
  templateSha256: string;
}
export interface OutboxStorageArtifact {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  objectsSql: string;
  roleBindingsSql: string;
  manifest: OutboxStorageManifest;
}

const DEFAULT_ROLES = ['stynx_owner', 'stynx_app', 'stynx_reader'] as const;
function roleMap(binding: StorageRoleBinding): Record<string, string> {
  return {
    stynx_owner: binding.ownerRole,
    stynx_app: binding.appRole,
    stynx_reader: binding.readerRole ?? 'stynx_reader',
  };
}
function bindSql(sql: string, binding: StorageRoleBinding): string {
  const roles = roleMap(binding);
  return sql
    .replace(
      /REFERENCES tenancy\.tenants\(id\)/gu,
      `REFERENCES ${quoteStorageIdentifier(binding.tenantTable.schema)}.${quoteStorageIdentifier(binding.tenantTable.table)}(${quoteStorageIdentifier(binding.tenantTable.column)})`,
    )
    .replace(
      /'(stynx_owner|stynx_app|stynx_reader)'|\b(stynx_owner|stynx_app|stynx_reader)\b/gu,
      (_whole, literal: string | undefined, identifier: string | undefined) => {
        const value = roles[literal ?? identifier!]!;
        return literal ? `'${value.replaceAll("'", "''")}'` : quoteStorageIdentifier(value);
      },
    );
}
function policyName(name: string, roles: readonly string[], binding: StorageRoleBinding): string {
  const custom =
    roles.includes('stynx_app') && binding.appRole !== 'stynx_app'
      ? binding.appRole
      : roles.includes('stynx_reader') && binding.readerRole !== 'stynx_reader'
        ? binding.readerRole
        : null;
  return custom === null
    ? name
    : `${name}__${createHash('sha256').update(custom).digest('hex').slice(0, 12)}`;
}
function bindStatement(statement: string, binding: StorageRoleBinding): string | null {
  let sql = statement;
  if (binding.readerRole === null && sql.includes('stynx_reader')) {
    if (/ TO stynx_reader\b/u.test(sql) || / FROM stynx_reader;/u.test(sql)) return null;
    sql = sql.replace(/,\s*stynx_reader\b|\bstynx_reader\s*,\s*/gu, '');
  }
  const policy = sql.match(/^CREATE POLICY (\w+) ON (outbox\.\w+)/u);
  if (policy) {
    const roles = DEFAULT_ROLES.filter((role) => sql.includes(`TO ${role}`));
    const name = policyName(policy[1]!, roles, binding);
    sql = sql.replace(`CREATE POLICY ${policy[1]}`, `CREATE POLICY ${name}`);
    sql = `DROP POLICY IF EXISTS ${name} ON ${policy[2]};\n${sql}`;
  }
  return bindSql(sql, binding);
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  return `{${Object.entries(value)
    .sort(([a], [b]) => a.localeCompare(b, 'en'))
    .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
    .join(',')}}`;
}
function bindCatalog(binding: StorageRoleBinding): StorageCatalogEntry[] {
  const roles = roleMap(binding);
  const replace = (value: unknown): unknown => {
    if (typeof value === 'string')
      return value.replace(
        /\bstynx_owner\b|\bstynx_app\b|\bstynx_reader\b/gu,
        (role) => roles[role]!,
      );
    if (Array.isArray(value)) return value.map(replace);
    if (value !== null && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replace(item)]));
    return value;
  };
  return OUTBOX_STORAGE_CATALOG.entries.flatMap((original) => {
    const entry = JSON.parse(JSON.stringify(original)) as StorageCatalogEntry;
    if (
      binding.readerRole === null &&
      ((['grant', 'default-grant'].includes(entry.kind) &&
        entry.value.grantee === 'stynx_reader') ||
        (entry.kind === 'policy' && (entry.value.roles as string[]).includes('stynx_reader')))
    )
      return [];
    if (entry.kind === 'policy') {
      const dot = entry.name.indexOf('.');
      entry.name =
        entry.name.slice(0, dot + 1) +
        policyName(entry.name.slice(dot + 1), entry.value.roles as string[], binding);
    }
    if (
      entry.kind === 'constraint' &&
      entry.value.referencedSchema === 'tenancy' &&
      entry.value.referencedTable === 'tenants'
    ) {
      entry.value.referencedSchema = binding.tenantTable.schema;
      entry.value.referencedTable = binding.tenantTable.table;
      entry.value.referencedColumns = [binding.tenantTable.column];
    }
    return [replace(entry) as StorageCatalogEntry];
  });
}

/** Pure offline renderer; no connection, subprocess, ambient checkout or data mutation. */
export function renderOutboxStorage(options: OutboxStorageOptions = {}): OutboxStorageArtifact {
  const binding = resolveStorageRoleBinding(options);
  const { contractVersion, packageVersion } = OUTBOX_STORAGE_TEMPLATE;
  const objectsSql =
    OUTBOX_STORAGE_TEMPLATE.objects.map((sql) => bindSql(sql, binding)).join('\n\n') + '\n';
  const roleBindingsSql =
    OUTBOX_STORAGE_TEMPLATE.bindings
      .map((sql) => bindStatement(sql, binding))
      .filter((sql) => sql !== null)
      .join('\n\n') + '\n';
  return {
    contractVersion,
    packageVersion,
    binding,
    objectsSql,
    roleBindingsSql,
    manifest: {
      contractVersion,
      packageVersion,
      sources: OUTBOX_STORAGE_CATALOG.sources,
      catalog: bindCatalog(binding),
      templateSha256: createHash('sha256').update(stable(OUTBOX_STORAGE_TEMPLATE)).digest('hex'),
      dependencies: [
        'PostgreSQL gen_random_uuid(), clock_timestamp(), nextval(), advisory transaction locks',
        'stynx.audit_chain_key transaction GUC binds one exact tenant chain per transaction',
        'pg_advisory_xact_lock(hashtextextended(tenant_id::text,0)) precedes clock/event writes',
        'outbox.legacy_ownership singleton FOR SHARE for append; FOR UPDATE for cutover',
        'trusted app.tenant_id, app.actor_id and app.role transaction settings',
        'READ COMMITTED writable primary app transactions for append and delivery mutations',
        'tenant UUID key with uniqueness and configured owner migration privileges',
        'platform audit chain only for platform legacy cutover; consumer-owned cutover unsupported',
      ],
    },
  };
}

/** Verifies the live owner read-only transaction; never repairs, grants or commits. */
export async function verifyOutboxStorage(
  trx: StorageVerifierTransaction,
  options: OutboxStorageOptions = {},
): Promise<StorageVerificationReport> {
  const artifact = renderOutboxStorage(options);
  const { binding, contractVersion, packageVersion } = artifact;
  const checks: StorageVerificationCheck[] = [];
  const report = (): StorageVerificationReport => ({
    binding,
    contractVersion,
    packageVersion,
    checks,
    supported: checks.length > 0 && checks.every((check) => check.status === 'pass'),
  });
  const check = (id: string, object: string, expected: unknown, actual: unknown): void => {
    checks.push({
      id,
      object,
      expected,
      actual,
      status: stable(expected) === stable(actual) ? 'pass' : 'fail',
    });
  };
  try {
    const admission = await trx.query<{ owner: string; readonly: string }>(
      `select current_user::text as owner,current_setting('transaction_read_only') as readonly`,
    );
    check('transaction-owner', 'transaction', binding.ownerRole, admission.rows[0]?.owner);
    check('transaction-read-only', 'transaction', 'on', admission.rows[0]?.readonly);
    if (checks.some((item) => item.status !== 'pass')) return report();
    const visibility = await trx.query<{ visible: boolean }>(
      `select coalesce(bool_and(not row_security_active(c.oid)),false) as visible
       from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       where n.nspname='outbox' and c.relkind in ('r','p')`,
    );
    check('owner-full-row-visibility', 'outbox', true, visibility.rows[0]?.visible);
    if (checks.some((item) => item.status !== 'pass')) return report();
    const roles = await trx.query<{
      name: string;
      superuser: boolean;
      bypass: boolean;
      owns: boolean;
      ownerMember: boolean;
      unsafeMembership: boolean;
    }>(
      `select r.rolname as name,r.rolsuper as superuser,r.rolbypassrls as bypass,
        exists(select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='outbox' and c.relowner=r.oid) as owns,
        pg_has_role(r.oid,$1::name,'MEMBER') as "ownerMember",
        exists(select 1 from pg_catalog.pg_roles p where (p.rolsuper or p.rolbypassrls)
          and pg_has_role(r.oid,p.oid,'MEMBER')) as "unsafeMembership"
       from pg_catalog.pg_roles r where r.rolname=$2 or r.rolname=$3`,
      [binding.ownerRole, binding.appRole, binding.readerRole],
    );
    for (const name of [binding.appRole, binding.readerRole].filter((name) => name !== null)) {
      check(
        `restricted-role:${name}`,
        name,
        {
          name,
          superuser: false,
          bypass: false,
          owns: false,
          ownerMember: false,
          unsafeMembership: false,
        },
        roles.rows.find((row) => row.name === name),
      );
    }
    const schema = await trx.query<{ owner: string }>(
      `select pg_get_userbyid(nspowner) as owner from pg_catalog.pg_namespace where nspname='outbox'`,
    );
    check('schema-owner', 'outbox', binding.ownerRole, schema.rows[0]?.owner);
    const expected = artifact.manifest.catalog;
    const actual = await collectStorageCatalog(trx, 'outbox');
    // Additional role bindings are allowed. Their grants/policies cannot count
    // as the configured role's required grants or bypass its least-grant check.
    const relevantRoles = new Set([
      'PUBLIC',
      binding.ownerRole,
      binding.appRole,
      binding.readerRole,
    ]);
    const applicable = await trx.query<{ name: string }>(
      `select rolname as name from pg_catalog.pg_roles where pg_has_role($1::name,oid,'MEMBER')
        or ($2::text is not null and pg_has_role($2::name,oid,'MEMBER'))`,
      [binding.appRole, binding.readerRole],
    );
    const policyRoles = new Set(['PUBLIC', ...applicable.rows.map((row) => row.name)]);
    const relevant = (entry: StorageCatalogEntry): boolean =>
      ['grant', 'default-grant'].includes(entry.kind)
        ? relevantRoles.has(entry.value.grantee as string)
        : entry.kind === 'policy'
          ? (entry.value.roles as string[]).some((role) => policyRoles.has(role))
          : true;
    const observed = new Map(
      actual.filter(relevant).map((entry) => [`${entry.kind}:${entry.name}`, entry]),
    );
    for (const entry of expected) {
      const key = `${entry.kind}:${entry.name}`;
      // Unexpected schema definitions can contain literals that were never
      // approved for disclosure. Compare exact bytes but report their digests.
      const summary = (value: unknown): unknown =>
        value === undefined
          ? null
          : {
              sha256: createHash('sha256').update(stable(value)).digest('hex'),
            };
      check(
        `catalog:${key}`,
        `outbox.${entry.name}`,
        summary(entry.value),
        summary(observed.get(key)?.value),
      );
      observed.delete(key);
    }
    for (const [key, entry] of observed)
      check(`catalog-unexpected:${key}`, `outbox.${entry.name}`, null, {
        sha256: createHash('sha256').update(stable(entry.value)).digest('hex'),
      });
    const privileges = await trx.query<{
      role: string;
      object: string;
      parent: string | null;
      privilege: string;
      allowed: boolean;
      grantable: boolean;
    }>(
      `with capabilities as (
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
      [binding.appRole, binding.readerRole],
    );
    for (const row of privileges.rows) {
      const allowed = expected.some(
        (entry) =>
          entry.kind === 'grant' &&
          [row.object, row.parent].includes(entry.value.object as string) &&
          [row.role, 'PUBLIC'].includes(entry.value.grantee as string) &&
          entry.value.privilege === row.privilege,
      );
      check(
        `effective-grant:${row.role}:${row.object}:${row.privilege}`,
        `outbox.${row.object}`,
        allowed,
        row.allowed,
      );
      check(
        `effective-grant-option:${row.role}:${row.object}:${row.privilege}`,
        `outbox.${row.object}`,
        false,
        row.grantable,
      );
    }
    const foreignKeys = expected.filter(
      (entry) => entry.kind === 'constraint' && entry.value.kind === 'f',
    );
    const enforcement = await trx.query<{ valid: boolean }>(
      `select coalesce(bool_and(t.tgenabled in ('O','A')),false) as valid
       from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid
       join pg_catalog.pg_namespace n on n.oid=c.relnamespace
       left join pg_catalog.pg_trigger t on t.tgconstraint=k.oid
       where n.nspname='outbox' and k.contype='f'`,
    );
    check('foreign-key-enforcement', 'outbox', true, enforcement.rows[0]?.valid);
    for (const entry of foreignKeys) {
      const table = entry.name.slice(0, entry.name.indexOf('.'));
      const columns = entry.value.columns as string[];
      const referenced = entry.value.referencedColumns as string[];
      const identifiers = columns.map((name) => quoteStorageIdentifier(name));
      const source = `outbox.${quoteStorageIdentifier(table)}`;
      const target = `${quoteStorageIdentifier(entry.value.referencedSchema as string)}.${quoteStorageIdentifier(entry.value.referencedTable as string)}`;
      const predicate = identifiers.map((name) => `child.${name} is not null`).join(' and ');
      const equality = identifiers
        .map((name, index) => `child.${name}=parent.${quoteStorageIdentifier(referenced[index]!)}`)
        .join(' and ');
      const orphans = await trx.query<{ count: string }>(
        `select count(*)::text as count from ${source} child
         where ${predicate} and not exists(select 1 from ${target} parent where ${equality})`,
      );
      check(`stored-foreign-key:${entry.name}`, source, '0', orphans.rows[0]?.count);
    }
    const marker = await trx.query<{ valid: boolean }>(
      `select count(*)=1 and bool_and(id and state in ('LEGACY','NEW') and generation>=0) as valid
       from outbox.legacy_ownership`,
    );
    check('ownership-marker', 'outbox.legacy_ownership', true, marker.rows[0]?.valid);
    const data = await trx.query<{ tenantId: string; finding: string; count: string }>(
      `select tenant_id::text as "tenantId",'retirement-projection' as finding,count(*)::text as count
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
    );
    check('stored-row-invariants', 'outbox', [], data.rows);
    const sequence = await trx.query<{ available: boolean }>(
      `select last_value::numeric+case when is_called then 1 else 0 end<=9223372036854775807 as available
       from outbox.event_order_seq`,
    );
    check('cursor-sequence-available', 'outbox.event_order_seq', true, sequence.rows[0]?.available);
  } catch (error) {
    checks.push({
      id: 'verification-unavailable',
      object: 'outbox',
      status: 'unknown',
      reason: `Catalog or invariant verification unavailable${
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string' &&
        /^[A-Z0-9]{5}$/u.test(error.code)
          ? ` (${error.code})`
          : ''
      }`,
    });
  }
  return report();
}
