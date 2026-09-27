import { Test, type TestingModule } from '@nestjs/testing';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Client } from 'pg';
import { StynxDataModule } from '../../src/data.module';
import { StynxMigrationRunner } from '../../src/migration-runner';
import { createPostgresTestDatabase } from '../support/postgres';

async function expectedPlatformMigrationIds(): Promise<string[]> {
  const migrationDir = resolve(__dirname, '../../migrations/platform');
  const filenames = await readdir(migrationDir);
  return filenames.filter((filename) => filename.endsWith('.sql')).sort();
}

async function createMigratedModule(connectionString: string): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString },
          app: { connectionString },
          reader: { connectionString },
        },
        migrations: {
          enabled: true,
        },
      }),
    ],
  }).compile();

  await moduleRef.init();
  return moduleRef;
}

async function queryExistingNames(client: Client, sql: string): Promise<string[]> {
  const result = await client.query<{ name: string }>(sql);
  return result.rows.map((row) => row.name).sort();
}

describe('Stynx platform migrations', () => {
  it('upgrades enabled actorless schedules while preserving pending historical jobs', async () => {
    // UPS-JOB-01: a migrated template already has 0019 and cannot model legacy rows.
    const testDatabase = await createPostgresTestDatabase('stynx_jobs_legacy', { useTemplate: false });
    const client = await testDatabase.connectAsAdmin();
    let moduleRef: TestingModule | undefined;
    const tenantId = '11111111-1111-4111-8111-111111111111';
    const scheduleId = '22222222-2222-4222-8222-222222222222';
    const jobId = '33333333-3333-4333-8333-333333333333';
    try {
      await client.query(`create schema if not exists core;
        create table if not exists core.schema_migrations (
          id text primary key, checksum text, applied_at timestamptz not null default clock_timestamp()
        )`);
      const migrationDir = resolve(__dirname, '../../migrations/platform');
      const filenames = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
      for (const filename of filenames.filter((file) => file < '0019_jobs_actor_timezone.sql')) {
        const sql = await readFile(resolve(migrationDir, filename), 'utf8');
        await client.query('begin');
        try {
          await client.query(sql);
          await client.query(`insert into core.schema_migrations(id,checksum,applied_at)
            values ($1,md5($2),clock_timestamp())`, [filename, sql]);
          if (filename === '0002_extensions.sql') {
            await client.query('alter schema core owner to stynx_owner');
            await client.query('alter table core.schema_migrations owner to stynx_owner');
            await client.query('set role stynx_owner');
          }
          await client.query('commit');
        } catch (error) {
          await client.query('rollback');
          throw error;
        }
      }
      await client.query(`insert into tenancy.tenants(id,slug,name)
        values ($1,'legacy-jobs-tenant','Legacy Jobs Tenant')`, [tenantId]);
      await client.query(`insert into jobs.schedules(id,tenant_id,name,job_type,kind,interval_seconds,next_run_at,is_enabled)
        values ($1,$2,'legacy-actorless','jobs.legacy','interval',60,clock_timestamp(),true)`,
      [scheduleId, tenantId]);
      await client.query(`insert into jobs.jobs(id,tenant_id,schedule_id,job_type,run_at,actor_id)
        values ($1,$2,$3,'jobs.legacy',clock_timestamp(),null)`, [jobId, tenantId, scheduleId]);
      await client.query('reset role');

      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-legacy-owner'));
      const legacy = await client.query<{
        actor_id: string | null; timezone: string; is_enabled: boolean;
      }>(`select actor_id::text, timezone, is_enabled from jobs.schedules where id=$1`, [scheduleId]);
      expect(legacy.rows).toEqual([{ actor_id: null, timezone: 'UTC', is_enabled: false }]);
      const pending = await client.query<{ status: string; actor_id: string | null }>(`
        select status::text, actor_id::text from jobs.jobs where id=$1`, [jobId]);
      expect(pending.rows).toEqual([{ status: 'pending', actor_id: null }]);
      const constraint = await client.query<{ convalidated: boolean; definition: string }>(`
        select convalidated, pg_get_constraintdef(oid) as definition
        from pg_constraint where conrelid='jobs.schedules'::regclass
          and contype='c' and pg_get_constraintdef(oid) like '%actor_id%'
      `);
      expect(constraint.rows).toHaveLength(1);
      expect(constraint.rows[0]?.convalidated).toBe(true);
      expect(constraint.rows[0]?.definition).toContain('actor_id IS NOT NULL');
      const actorFk = await client.query<{ confdeltype: string }>(`
        select confdeltype from pg_constraint where conrelid='jobs.schedules'::regclass
          and contype='f' and pg_get_constraintdef(oid) like '%actor_id%'
      `);
      expect(actorFk.rows).toEqual([{ confdeltype: 'r' }]);
      const grantsAndRls = await client.query<{
        table_name: string; row_security: boolean; force_rls: boolean;
        app_read: boolean; app_write: boolean; reader_read: boolean; reader_write: boolean;
      }>(`
        select c.relname as table_name, c.relrowsecurity as row_security,
               c.relforcerowsecurity as force_rls,
               has_table_privilege('stynx_app',c.oid,'SELECT') as app_read,
               has_table_privilege('stynx_app',c.oid,'INSERT') as app_write,
               has_table_privilege('stynx_reader',c.oid,'SELECT') as reader_read,
               has_table_privilege('stynx_reader',c.oid,'INSERT') as reader_write
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='jobs' and c.relname in ('jobs','schedules')
        order by c.relname
      `);
      expect(grantsAndRls.rows).toEqual([
        { table_name: 'jobs', row_security: true, force_rls: true,
          app_read: true, app_write: true, reader_read: true, reader_write: false },
        { table_name: 'schedules', row_security: true, force_rls: true,
          app_read: true, app_write: true, reader_read: true, reader_write: false },
      ]);
      await expect(client.query(`update jobs.schedules set is_enabled=true where id=$1`, [scheduleId]))
        .rejects.toMatchObject({ code: '23514' });
    } finally {
      await moduleRef?.close();
      await client.end();
      await testDatabase.dispose();
    }
  });

  it('boots the platform schema, enforces RLS, and reruns idempotently', async () => {
    const expectedMigrationIds = await expectedPlatformMigrationIds();
    const testDatabase = await createPostgresTestDatabase('stynx_data_migrations', {
      useTemplate: false,
    });
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(
        testDatabase.connectionString('stynx-migration-owner'),
      );
      adminClient = await testDatabase.connectAsAdmin();

      const schemas = await queryExistingNames(
        adminClient,
        `
          select nspname as name
          from pg_namespace
          where nspname in ('archive', 'audit', 'auth', 'core', 'data', 'storage', 'tenancy')
          order by nspname
        `,
      );
      expect(schemas).toEqual(['archive', 'audit', 'auth', 'core', 'data', 'storage', 'tenancy']);

      const tables = await queryExistingNames(
        adminClient,
        `
          select format('%s.%s', table_schema, table_name) as name
          from information_schema.tables
          where table_schema in ('tenancy', 'auth', 'core', 'audit', 'storage')
            and table_type = 'BASE TABLE'
          order by 1
        `,
      );
      expect(tables).toEqual(
        expect.arrayContaining([
          'audit.log',
          'audit.system_op',
          'auth.direct_perms',
          'auth.group_memberships',
          'auth.group_roles',
          'auth.groups',
          'auth.invitations',
          'auth.membership_roles',
          'auth.memberships',
          'auth.perms',
          'auth.role_perms',
          'auth.roles',
          'auth.sessions',
          'auth.users',
          'core.config',
          'core.idempotency_keys',
          'core.pii_map',
          'core.rate_limit_overrides',
          'core.schema_migrations',
          'core.softdelete_fk_registry',
          'storage.document_acl',
          'storage.document_versions',
          'storage.documents',
          'tenancy.tenant_settings',
          'tenancy.tenants',
        ]),
      );

      const partitions = await queryExistingNames(
        adminClient,
        `
          select format('%s.%s', partition_ns.nspname, partition_cls.relname) as name
          from pg_inherits
          join pg_class partition_cls on partition_cls.oid = pg_inherits.inhrelid
          join pg_namespace partition_ns on partition_ns.oid = partition_cls.relnamespace
          join pg_class parent_cls on parent_cls.oid = pg_inherits.inhparent
          join pg_namespace parent_ns on parent_ns.oid = parent_cls.relnamespace
          where format('%s.%s', parent_ns.nspname, parent_cls.relname) in ('auth.sessions', 'audit.log')
          order by 1
        `,
      );
      expect(partitions).toHaveLength(2);

      const rlsTables = await adminClient.query<{ name: string; forced: boolean }>(`
        select format('%s.%s', n.nspname, c.relname) as name, c.relforcerowsecurity as forced
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where format('%s.%s', n.nspname, c.relname) in (
          'tenancy.tenants',
          'tenancy.tenant_settings',
          'auth.roles',
          'auth.memberships',
          'auth.direct_perms',
          'auth.groups',
          'auth.group_memberships',
          'auth.group_roles',
          'auth.sessions',
          'auth.invitations'
        )
        order by 1
      `);
      expect(rlsTables.rows).toHaveLength(10);
      expect(rlsTables.rows.every((row) => row.forced)).toBe(true);

      const curatedAuditTables = await queryExistingNames(
        adminClient,
        `
          select format('%s.%s', n.nspname, c.relname) as name
          from pg_trigger t
          join pg_class c on c.oid = t.tgrelid
          join pg_namespace n on n.oid = c.relnamespace
          where t.tgname like 'trg_audit_%'
            and n.nspname in ('auth', 'core', 'storage', 'tenancy')
            and not t.tgisinternal
          order by 1
        `,
      );
      expect(curatedAuditTables).toEqual(
        expect.arrayContaining([
          'auth.direct_perms',
          'auth.group_memberships',
          'auth.group_roles',
          'auth.groups',
          'auth.invitations',
          'auth.membership_roles',
          'auth.memberships',
          'auth.perms',
          'auth.role_perms',
          'auth.roles',
          'auth.sessions',
          'auth.users',
          'core.config',
          'core.idempotency_keys',
          'core.pii_map',
          'core.rate_limit_overrides',
          'core.schema_migrations',
          'core.softdelete_fk_registry',
          'storage.document_acl',
          'storage.document_versions',
          'storage.documents',
          'tenancy.tenant_settings',
          'tenancy.tenants',
        ]),
      );

      const curatedTablesMissingAudit = await queryExistingNames(
        adminClient,
        `
          with curated_tables as (
            select c.oid, format('%s.%s', n.nspname, c.relname) as name
            from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
            left join pg_inherits inherited on inherited.inhrelid = c.oid
            where n.nspname in ('auth', 'core', 'flow', 'storage', 'tenancy')
              and c.relkind in ('r', 'p')
              and inherited.inhrelid is null
          )
          select name
          from curated_tables curated
          where not exists (
            select 1
            from pg_trigger trg
            where trg.tgrelid = curated.oid
              and trg.tgname like 'trg_audit_%'
              and not trg.tgisinternal
          )
          order by name
        `,
      );
      expect(curatedTablesMissingAudit).toEqual([]);

      const tenantId = '11111111-1111-1111-1111-111111111111';
      await adminClient.query('set role stynx_app');
      await adminClient.query('begin');
      await adminClient.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
      await adminClient.query(
        `
          insert into tenancy.tenants (id, slug, name)
          values ($1, 'tenant-app-smoke', 'Tenant App Smoke')
        `,
        [tenantId],
      );
      await adminClient.query('commit');
      await adminClient.query('reset role');

      await adminClient.query('set role stynx_reader');
      await adminClient.query('begin');
      await adminClient.query(`select set_config('app.tenant_id', $1, true)`, [tenantId]);
      await expect(
        adminClient.query(
          `
            insert into tenancy.tenants (id, slug, name)
            values ('22222222-2222-2222-2222-222222222222', 'tenant-reader-smoke', 'Tenant Reader Smoke')
          `,
        ),
      ).rejects.toThrow('permission denied');
      await adminClient.query('rollback');
      await adminClient.query('reset role');

      const migrationRunner = moduleRef.get(StynxMigrationRunner);
      const beforeCount = await adminClient.query<{ count: string }>(
        `select count(*)::text as count from core.schema_migrations`,
      );

      await migrationRunner.runPlatformMigrations();

      const afterCount = await adminClient.query<{ count: string }>(
        `select count(*)::text as count from core.schema_migrations`,
      );
      const appliedMigrations = await queryExistingNames(
        adminClient,
        `select id as name from core.schema_migrations`,
      );
      expect(afterCount.rows[0]?.count).toBe(beforeCount.rows[0]?.count);
      expect(appliedMigrations).toEqual(expectedMigrationIds);
      expect(afterCount.rows[0]?.count).toBe(String(expectedMigrationIds.length));
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });

  it('creates soft-deletable live/archive pairs and rejects invalid registry behavior', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_helpers');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-helper-owner'));
      adminClient = await testDatabase.connectAsAdmin();

      await adminClient.query('set role stynx_owner');
      await adminClient.query('create schema demo authorization stynx_owner');
      await adminClient.query('grant usage on schema demo to stynx_app, stynx_reader');
      await adminClient.query(`
        select data.create_soft_deletable_table($ddl$
          CREATE TABLE demo.customer (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
            email text NOT NULL,
            created_at timestamptz NOT NULL DEFAULT clock_timestamp()
          )
        $ddl$)
      `);

      const objects = await queryExistingNames(
        adminClient,
        `
          select value as name
          from (
            values
              (to_regclass('demo.customer')::text),
              (to_regclass('archive.demo_customer')::text)
          ) objects(value)
          where value is not null
        `,
      );
      expect(objects).toEqual(['archive.demo_customer', 'demo.customer']);

      const comment = await adminClient.query<{ comment: string }>(
        `select obj_description('archive.demo_customer'::regclass, 'pg_class') as comment`,
      );
      expect(comment.rows[0]?.comment).toBe('stynx:archive-source=demo.customer');

      const policies = await queryExistingNames(
        adminClient,
        `
          select format('%s.%s.%s', schemaname, tablename, policyname) as name
          from pg_policies
          where schemaname in ('demo', 'archive')
            and tablename in ('customer', 'demo_customer')
          order by 1
        `,
      );
      expect(policies).toEqual([
        'archive.demo_customer.tenant_isolation',
        'demo.customer.tenant_isolation',
      ]);

      await expect(
        adminClient.query(`
          select data.create_soft_deletable_table($ddl$
            CREATE TABLE demo.customer (
              id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
              tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id),
              email text NOT NULL,
              created_at timestamptz NOT NULL DEFAULT clock_timestamp()
            )
          $ddl$)
        `),
      ).rejects.toThrow('Live table');

      await expect(
        adminClient.query(`
          select data.register_softdelete_fk(
            'demo',
            'customer',
            'demo',
            'child',
            'customer_child_fk',
            'invalid'
          )
        `),
      ).rejects.toThrow('Invalid softdelete FK behavior');

      await adminClient.query('reset role');
    } finally {
      await adminClient?.end();
      await moduleRef?.close();
      await testDatabase.dispose();
    }
  });
});
