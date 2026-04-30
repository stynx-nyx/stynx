#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const databaseUrl = process.env.STYNX_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL or STYNX_DATABASE_URL is required');
}

function psql(sql) {
  const result = spawnSync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-Atqc', sql], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || 'psql failed').trim());
  }
  return result.stdout.trim();
}

function rows(sql) {
  const output = psql(sql);
  return output ? output.split('\n') : [];
}

function assertEmpty(label, sql, failures) {
  const missing = rows(sql);
  if (missing.length > 0) {
    failures.push(`${label}: ${missing.join(', ')}`);
  }
}

const failures = [];

assertEmpty(
  'missing schemas',
  `
    with expected(name) as (
      values ('core'), ('tenancy'), ('auth'), ('audit'), ('storage'), ('archive'), ('data'), ('public')
    )
    select expected.name
    from expected
    left join pg_namespace ns on ns.nspname = expected.name
    where ns.oid is null
    order by expected.name
  `,
  failures,
);

assertEmpty(
  'role attribute mismatch',
  `
    with expected(name, bypass_rls) as (
      values
        ('stynx_owner', true),
        ('stynx_app', false),
        ('stynx_reader', false)
    )
    select expected.name
    from expected
    left join pg_roles role on role.rolname = expected.name
    where role.oid is null
       or role.rolbypassrls is distinct from expected.bypass_rls
    order by expected.name
  `,
  failures,
);

assertEmpty(
  'soft-deletable archive source missing live table',
  `
    select archive_ns.nspname || '.' || archive_cls.relname
    from pg_class archive_cls
    join pg_namespace archive_ns on archive_ns.oid = archive_cls.relnamespace
    where archive_ns.nspname = 'archive'
      and archive_cls.relkind = 'r'
      and obj_description(archive_cls.oid, 'pg_class') like 'stynx:archive-source=%'
      and to_regclass(replace(obj_description(archive_cls.oid, 'pg_class'), 'stynx:archive-source=', '')) is null
    order by 1
  `,
  failures,
);

assertEmpty(
  'tenant_id tables missing RLS tenant policy',
  `
    select columns.table_schema || '.' || columns.table_name
    from information_schema.columns columns
    join pg_class cls on cls.relname = columns.table_name
    join pg_namespace ns on ns.oid = cls.relnamespace and ns.nspname = columns.table_schema
    where columns.column_name = 'tenant_id'
      and columns.table_schema not in ('information_schema', 'pg_catalog')
      and columns.table_schema not like 'pg_toast%'
      and cls.relkind = 'r'
      and not exists (
        select 1
        from pg_inherits inherits
        where inherits.inhrelid = cls.oid
      )
      and (
        cls.relrowsecurity is not true
        or not exists (
          select 1
          from pg_policies policies
          where policies.schemaname = columns.table_schema
            and policies.tablename = columns.table_name
        )
      )
    order by 1
  `,
  failures,
);

assertEmpty(
  'audited tables missing audit trigger',
  `
    select source
    from (
      select replace(obj_description(archive_cls.oid, 'pg_class'), 'stynx:archive-source=', '') as source
      from pg_class archive_cls
      join pg_namespace archive_ns on archive_ns.oid = archive_cls.relnamespace
      where archive_ns.nspname = 'archive'
        and archive_cls.relkind = 'r'
        and obj_description(archive_cls.oid, 'pg_class') like 'stynx:archive-source=%'
      union
      select 'archive.' || archive_cls.relname as source
      from pg_class archive_cls
      join pg_namespace archive_ns on archive_ns.oid = archive_cls.relnamespace
      where archive_ns.nspname = 'archive'
        and archive_cls.relkind = 'r'
        and obj_description(archive_cls.oid, 'pg_class') like 'stynx:archive-source=%'
    ) audited
    where to_regclass(audited.source) is not null
      and not exists (
        select 1
        from pg_trigger trigger
        join pg_class cls on cls.oid = trigger.tgrelid
        join pg_namespace ns on ns.oid = cls.relnamespace
        join pg_proc proc on proc.oid = trigger.tgfoid
        join pg_namespace proc_ns on proc_ns.oid = proc.pronamespace
        where ns.nspname || '.' || cls.relname = audited.source
          and proc_ns.nspname = 'audit'
          and proc.proname = 'fn_row_change'
          and trigger.tgisinternal is false
      )
    order by 1
  `,
  failures,
);

if (failures.length > 0) {
  console.error('[db:verify] failed');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('[db:verify] passed');
