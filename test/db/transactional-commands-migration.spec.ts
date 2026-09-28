import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createPostgresTestDatabase } from '../../packages/data/test/support/postgres';

const migrationDirectory = resolve(__dirname, '../../packages/data/migrations/platform');
const migrationName = '0020_transactional_commands.sql';
const tenantA = '66666666-6666-6666-6666-666666666666';
const tenantB = '77777777-7777-7777-7777-777777777777';
const actorId = '88888888-8888-8888-8888-888888888888';

async function migrationFiles(): Promise<string[]> {
  return (await readdir(migrationDirectory)).filter((file) => file.endsWith('.sql')).sort();
}

async function applyMigrationsThrough(
  client: Awaited<ReturnType<Awaited<ReturnType<typeof createPostgresTestDatabase>>['connectAsAdmin']>>,
  stopAt?: string,
): Promise<void> {
  for (const filename of await migrationFiles()) {
    await client.query(await readFile(resolve(migrationDirectory, filename), 'utf8'));
    if (filename === '0002_extensions.sql') await client.query('set role stynx_owner');
    if (filename === stopAt) return;
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

describe('transactional command migration 0020', () => {
  it('is present in the platform migration graph and applies from an empty database', async () => {
    const files = await migrationFiles();
    expect(files).toContain(migrationName);

    const database = await createPostgresTestDatabase('stynx_transactional_commands_empty', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    try {
      await applyMigrationsThrough(client);
      const columns = await client.query<{ column_name: string }>(`
        select column_name
        from information_schema.columns
        where table_schema = 'core' and table_name = 'idempotency_keys'
      `);
      expect(columns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining([
        'tenant_id',
        'request_fingerprint',
        'response_headers',
        'response_status',
      ]));

      const wrapper = await client.query<{
        owner: string;
        security_definer: boolean;
        config: string[] | null;
        identity_args: string;
      }>(`
        select owner.rolname as owner, proc.prosecdef as security_definer,
               proc.proconfig as config, pg_get_function_identity_arguments(proc.oid) as identity_args
        from pg_proc proc
        join pg_namespace namespace on namespace.oid = proc.pronamespace
        join pg_roles owner on owner.oid = proc.proowner
        where namespace.nspname = 'audit' and proc.proname = 'write_command_event'
      `);
      expect(wrapper.rows).toHaveLength(1);
      expect(wrapper.rows[0]?.owner).toBe('stynx_owner');
      expect(wrapper.rows[0]?.security_definer).toBe(true);
      expect(wrapper.rows[0]?.config).toContain('search_path=pg_catalog, audit');
      expect(wrapper.rows[0]?.identity_args).not.toMatch(/tenant|actor/i);

      const grants = await client.query<{ app_execute: boolean; public_execute: boolean }>(`
        select has_function_privilege('stynx_app', proc.oid, 'EXECUTE') as app_execute,
               exists (
                 select 1
                 from aclexplode(coalesce(proc.proacl, acldefault('f', proc.proowner))) privilege
                 where privilege.grantee = 0 and privilege.privilege_type = 'EXECUTE'
               ) as public_execute
        from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace
        where namespace.nspname = 'audit' and proc.proname = 'write_command_event'
      `);
      expect(grants.rows).toEqual([{ app_execute: true, public_execute: false }]);

      const auditWrite = await client.query<{ app_execute: boolean }>(`
        select has_function_privilege('stynx_app', proc.oid, 'EXECUTE') as app_execute
        from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace
        where namespace.nspname = 'audit' and proc.proname = 'write'
      `);
      expect(auditWrite.rows).toEqual([{ app_execute: false }]);

      const rls = await client.query<{ table_name: string; enabled: boolean; forced: boolean }>(`
        select namespace.nspname || '.' || cls.relname as table_name,
               cls.relrowsecurity as enabled, cls.relforcerowsecurity as forced
        from pg_class cls join pg_namespace namespace on namespace.oid = cls.relnamespace
        where cls.oid in (
          'core.idempotency_keys'::regclass,
          'audit.events'::regclass,
          'audit.log'::regclass
        )
        order by table_name
      `);
      expect(rls.rows).toEqual([
        { table_name: 'audit.events', enabled: true, forced: true },
        { table_name: 'audit.log', enabled: true, forced: true },
        { table_name: 'core.idempotency_keys', enabled: true, forced: true },
      ]);
    } finally {
      await client.end();
      await database.dispose();
    }
  });

  it('upgrades the 0019 schema without rewriting a NULL-tenant legacy key', async () => {
    const files = await migrationFiles();
    expect(files).toContain(migrationName);
    const database = await createPostgresTestDatabase('stynx_transactional_commands_upgrade', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    try {
      await applyMigrationsThrough(client, '0019_jobs_actor_timezone.sql');
      await client.query(`
        insert into core.idempotency_keys (tenant_id, key, status, response)
        values (null, 'legacy-null-tenant', 'completed', '{"legacy":true}'::jsonb)
      `);
      await client.query(await readFile(resolve(migrationDirectory, migrationName), 'utf8'));

      const legacy = await client.query<{
        tenant_id: string | null;
        key: string;
        status: string;
        response: unknown;
      }>(`
        select tenant_id::text, key, status, response
        from core.idempotency_keys where key = 'legacy-null-tenant'
      `);
      expect(legacy.rows).toEqual([{
        tenant_id: null,
        key: 'legacy-null-tenant',
        status: 'completed',
        response: { legacy: true },
      }]);
    } finally {
      await client.end();
      await database.dispose();
    }
  });

  it('keeps command keys tenant-scoped under stynx_app FORCE RLS', async () => {
    const files = await migrationFiles();
    expect(files).toContain(migrationName);
    const database = await createPostgresTestDatabase('stynx_transactional_commands_rls', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    const appRole = 'stynx_app';
    try {
      await applyMigrationsThrough(client);
      await client.query('reset role');
      await client.query(`
        insert into tenancy.tenants (id, slug, name)
        values ($1::uuid, 'ctg5-tenant-a', 'CTG5 tenant A'),
               ($2::uuid, 'ctg5-tenant-b', 'CTG5 tenant B')
      `, [tenantA, tenantB]);
      await client.query('truncate core.idempotency_keys');
      await client.query(`
        insert into core.idempotency_keys (tenant_id, key, status)
        values ($1::uuid, 'same-key', 'pending'), ($2::uuid, 'same-key', 'pending')
      `, [tenantA, tenantB]);

      await client.query(`set role ${quoteIdentifier(appRole)}`);
      await client.query('begin');
      await client.query("select set_config('app.role', 'app', true)");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query("select set_config('app.actor_id', $1, true)", [actorId]);
      const visible = await client.query<{ tenant_id: string; key: string }>(`
        select tenant_id::text, key from core.idempotency_keys
        where tenant_id = $1::uuid and key = 'same-key'
      `, [tenantA]);
      expect(visible.rows).toEqual([{ tenant_id: tenantA, key: 'same-key' }]);
      const hidden = await client.query<{ count: string }>(`
        select count(*)::text as count from core.idempotency_keys where tenant_id = $1::uuid
      `, [tenantB]);
      expect(hidden.rows).toEqual([{ count: '0' }]);
      const updateOtherTenant = await client.query(`
        update core.idempotency_keys set status = 'completed'
        where tenant_id = $1::uuid and key = 'same-key'
      `, [tenantB]);
      expect(updateOtherTenant.rowCount).toBe(0);
      const deleteOtherTenant = await client.query(`
        delete from core.idempotency_keys
        where tenant_id = $1::uuid and key = 'same-key'
      `, [tenantB]);
      expect(deleteOtherTenant.rowCount).toBe(0);
      await expect(client.query(`
        insert into core.idempotency_keys (tenant_id, key, status)
        values ($1::uuid, 'foreign-key-attempt', 'pending')
      `, [tenantB])).rejects.toMatchObject({ code: '42501' });
      await client.query('rollback');
    } finally {
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });

  it('permits a valid app-role audit write and rejects absent or mismatched tenant identity', async () => {
    const files = await migrationFiles();
    expect(files).toContain(migrationName);
    const database = await createPostgresTestDatabase('stynx_transactional_commands_audit', {
      useTemplate: false,
    });
    const client = await database.connectAsAdmin();
    try {
      await applyMigrationsThrough(client);
      await client.query('reset role');
      const proc = await client.query<{ oid: string; argnames: string[]; argtypes: string[] }>(`
        select proc.oid::text,
               coalesce(proc.proargnames[1:proc.pronargs], array[]::text[]) as argnames,
               array(select format_type(type_oid, null)
                     from unnest(proc.proargtypes::oid[]) with ordinality as arg(type_oid, ord)
                     order by ord) as argtypes
        from pg_proc proc join pg_namespace namespace on namespace.oid = proc.pronamespace
        where namespace.nspname = 'audit' and proc.proname = 'write_command_event'
      `);
      expect(proc.rows).toHaveLength(1);
      const args = proc.rows[0]?.argnames ?? [];
      const values = args.map((arg) => {
        const name = arg.toLowerCase();
        if (name.includes('operation')) return "'COMMAND'::text";
        if (name.includes('entity_id')) return "'ctg5-db-command-1'::text";
        if (name.includes('entity')) return "'test.transactional_command'::text";
        if (name.includes('metadata')) return "'{\"source\":\"ctg5\"}'::jsonb";
        if (name.includes('old_data') || name.includes('new_data') || name.endsWith('_pk')) return 'null::jsonb';
        if (name.includes('request')) return "null::text";
        if (name.includes('ip') || name.includes('session')) return 'null::text';
        throw new Error(`Unexpected write_command_event parameter: ${arg}`);
      });
      const call = `select audit.write_command_event(${values.join(', ')})`;

      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.role', 'app', true)");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query("select set_config('app.actor_id', $1, true)", [actorId]);
      await client.query(call);
      await client.query('commit');
      await client.query('reset role');

      const events = await client.query<{
        tenant: string;
        actor: string;
        actor_role: string;
        chain_valid: boolean;
      }>(`
        select event.tenancy_id::text as tenant, event.actor_id::text as actor,
               event.actor_role,
               verify.chain_valid
        from audit.events event
        join audit.verify_chain($1::uuid, 100) verify on verify.event_id = event.event_id
        where event.entity = 'test.transactional_command'
          and event.entity_id = 'ctg5-db-command-1'
      `, [tenantA]);
      expect(events.rows).toEqual([{
        tenant: tenantA,
        actor: actorId,
        actor_role: 'app',
        chain_valid: true,
      }]);

      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.role', 'app', true)");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query("select set_config('app.actor_id', $1, true)", [actorId]);
      await client.query(call.replaceAll('ctg5-db-command-1', 'ctg5-db-command-rollback'));
      await client.query('rollback');
      await client.query('reset role');
      const rolledBack = await client.query<{ count: string }>(`
        select count(*)::text as count from audit.events
        where entity_id = 'ctg5-db-command-rollback'
      `);
      expect(rolledBack.rows).toEqual([{ count: '0' }]);

      await client.query('set role stynx_app');
      await client.query('begin');
      await client.query("select set_config('app.role', 'app', true)");
      await client.query("select set_config('app.tenant_id', '', true)");
      await client.query("select set_config('app.actor_id', $1, true)", [actorId]);
      await expect(client.query(call)).rejects.toMatchObject({
        code: expect.stringMatching(/^[A-Z0-9]{5}$/),
      });
      await client.query('rollback');

      await client.query('begin');
      await client.query("select set_config('app.role', 'app', true)");
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantA]);
      await client.query("select set_config('app.actor_id', '', true)");
      await expect(client.query(call)).rejects.toMatchObject({
        code: expect.stringMatching(/^[A-Z0-9]{5}$/),
      });
      await client.query('rollback');
      await client.query('reset role');
    } finally {
      await client.query('reset role').catch(() => undefined);
      await client.end();
      await database.dispose();
    }
  });
});
