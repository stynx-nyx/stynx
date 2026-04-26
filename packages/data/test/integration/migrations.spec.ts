import { Test, type TestingModule } from '@nestjs/testing';
import type { Client } from 'pg';
import { StynxDataModule } from '../../src/data.module';
import { StynxMigrationRunner } from '../../src/migration-runner';
import { createPostgresTestDatabase } from '../support/postgres';

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
  jest.setTimeout(120_000);

  it('boots the platform schema, enforces RLS, and reruns idempotently', async () => {
    const testDatabase = await createPostgresTestDatabase('stynx_data_migrations');
    let moduleRef: TestingModule | undefined;
    let adminClient: Client | undefined;

    try {
      moduleRef = await createMigratedModule(testDatabase.connectionString('stynx-migration-owner'));
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
      expect(afterCount.rows[0]?.count).toBe(beforeCount.rows[0]?.count);
      expect(afterCount.rows[0]?.count).toBe('13');
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
