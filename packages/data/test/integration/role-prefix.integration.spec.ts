import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client } from 'pg';
import { StynxDataModule } from '../../src/data.module';
import { Database } from '../../src/database';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres';

// SM-06 (S-18): a product bootstraps and connects as <product>_{owner,app,reader}.
// The platform migration files are immutable; the runner applies the role
// prefix at apply time. The default prefix keeps STYNX's own databases on the
// stynx_* roles; the `demo` prefix leaves no stynx_* role referenced at all.
const TENANT_A = 'd1111111-1111-4111-8111-111111111111';
const TENANT_B = 'd2222222-2222-4222-8222-222222222222';
const ACTOR = 'd3333333-3333-4333-8333-333333333333';

interface RoleReferences {
  owned: number;
  granted: number;
  policies: number;
  routines: number;
  policyExpressions: number;
}

/** Every catalog place in the current database a role of `prefix` can be referenced from. */
async function roleReferences(client: Client, prefix: string): Promise<RoleReferences> {
  const result = await client.query<RoleReferences>(
    `
      with r as (select oid from pg_roles where rolname like $1),
      owned as (
        select 1 from pg_class where relowner in (select oid from r)
        union all select 1 from pg_namespace where nspowner in (select oid from r)
        union all select 1 from pg_proc where proowner in (select oid from r)
        union all select 1 from pg_type where typowner in (select oid from r)
      ),
      granted as (
        select 1 from pg_class c, aclexplode(c.relacl) a where a.grantee in (select oid from r)
        union all select 1 from pg_namespace n, aclexplode(n.nspacl) a where a.grantee in (select oid from r)
        union all select 1 from pg_proc p, aclexplode(p.proacl) a where a.grantee in (select oid from r)
        union all select 1 from pg_database d, aclexplode(d.datacl) a
          where d.datname = current_database() and a.grantee in (select oid from r)
        union all select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
          where a.grantee in (select oid from r) or d.defaclrole in (select oid from r)
      )
      select
        (select count(*) from owned)::int as owned,
        (select count(*) from granted)::int as granted,
        (select count(*) from pg_policy where polroles && array(select oid from r))::int as policies,
        (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname not in ('pg_catalog', 'information_schema')
            and p.prosrc ~ $2)::int as routines,
        (select count(*) from pg_policy
          where coalesce(pg_get_expr(polqual, polrelid), '') ~ $2
             or coalesce(pg_get_expr(polwithcheck, polrelid), '') ~ $2)::int as "policyExpressions"
    `,
    [`${prefix}\\_%`, `\\m${prefix}_(owner|app|reader)\\M`],
  );
  return result.rows[0]!;
}

function total(references: RoleReferences): number {
  return Object.values(references).reduce((sum, count) => sum + count, 0);
}

async function roleChecksum(): Promise<string> {
  const sql = await readFile(resolve(__dirname, '../../migrations/platform/0001_roles.sql'), 'utf8');
  return createHash('md5').update(sql, 'utf8').digest('hex');
}

async function migrate(
  postgres: PostgresTestDatabase,
  appRole: string,
  rolePrefix?: string,
): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: postgres.connectionString('role-prefix-owner') },
          app: { connectionString: postgres.appConnectionString('role-prefix-app', appRole) },
          reader: { connectionString: postgres.connectionString('role-prefix-reader') },
        },
        retry: false,
        appRoleName: appRole,
        migrations: rolePrefix === undefined ? { enabled: true } : { enabled: true, rolePrefix },
      }),
    ],
  }).compile();
  await moduleRef.init();
  return moduleRef;
}

async function currentAppUser(moduleRef: TestingModule): Promise<string> {
  const database = moduleRef.get(Database);
  return database.withRequestContext({ tenantId: TENANT_A, actorId: ACTOR }, () =>
    database.tx(
      async (trx) => {
        const row = await trx.query<{ current_user: string }>('select current_user::text');
        return row.rows[0]!.current_user;
      },
      { requireActor: true, retry: false },
    ),
  );
}

/** Tenant isolation through the application role itself, never through the owner. */
async function expectTenantIsolation(postgres: PostgresTestDatabase, appRole: string): Promise<void> {
  const app = new Client({ connectionString: postgres.appConnectionString('role-prefix-rls', appRole) });
  await app.connect();
  try {
    const user = await app.query<{ current_user: string; bypass: boolean }>(
      'select current_user::text, rolbypassrls as bypass from pg_roles where rolname = current_user',
    );
    expect(user.rows).toEqual([{ current_user: appRole, bypass: false }]);
    for (const [tenant, slug] of [
      [TENANT_A, 'role-prefix-a'],
      [TENANT_B, 'role-prefix-b'],
    ] as const) {
      await app.query('begin');
      await app.query(`select set_config('app.tenant_id', $1, true)`, [tenant]);
      await app.query(`insert into tenancy.tenants (id, slug, name) values ($1, $2, $2)`, [tenant, slug]);
      await app.query('commit');
    }
    await app.query('begin');
    await app.query(`select set_config('app.tenant_id', $1, true)`, [TENANT_A]);
    const visible = await app.query<{ id: string }>('select id::text from tenancy.tenants order by id');
    await app.query('rollback');
    expect(visible.rows).toEqual([{ id: TENANT_A }]);
  } finally {
    await app.end();
  }
}

describe('platform migration role prefix (PostgreSQL)', () => {
  it('keeps the default stynx roles: applied as before, isolated as stynx_app', async () => {
    const postgres = await createPostgresTestDatabase('stynx_role_default', { useTemplate: false });
    let moduleRef: TestingModule | undefined;
    const admin = await postgres.connectAsAdmin();
    try {
      moduleRef = await migrate(postgres, 'stynx_app');

      const stynx = await roleReferences(admin, 'stynx');
      expect(stynx.owned).toBeGreaterThan(0);
      expect(stynx.granted).toBeGreaterThan(0);
      expect(stynx.policies).toBeGreaterThan(0);
      expect(total(await roleReferences(admin, 'demo'))).toBe(0);

      const checksum = await admin.query<{ checksum: string }>(
        `select checksum from core.schema_migrations where id = '0001_roles.sql'`,
      );
      expect(checksum.rows).toEqual([{ checksum: await roleChecksum() }]);
      const owner = await admin.query<{ owner: string }>(
        `select pg_get_userbyid(nspowner)::text as owner from pg_namespace where nspname = 'core'`,
      );
      expect(owner.rows).toEqual([{ owner: 'stynx_owner' }]);

      expect(await currentAppUser(moduleRef)).toBe('stynx_app');
      await expectTenantIsolation(postgres, 'stynx_app');
    } finally {
      await moduleRef?.close();
      await admin.end();
      await postgres.dispose();
    }
  });

  it('bootstraps prefix demo on demo_{owner,app,reader} with no stynx_ role referenced', async () => {
    const postgres = await createPostgresTestDatabase('stynx_role_demo', {
      useTemplate: false,
      rolePrefix: 'demo',
    });
    let moduleRef: TestingModule | undefined;
    const admin = await postgres.connectAsAdmin();
    try {
      moduleRef = await migrate(postgres, 'demo_app', 'demo');

      const roles = await admin.query<{ rolname: string; rolbypassrls: boolean; rolsuper: boolean }>(
        `select rolname::text, rolbypassrls, rolsuper from pg_roles
          where rolname in ('demo_owner', 'demo_app', 'demo_reader') order by rolname`,
      );
      expect(roles.rows).toEqual([
        { rolname: 'demo_app', rolbypassrls: false, rolsuper: false },
        { rolname: 'demo_owner', rolbypassrls: true, rolsuper: false },
        { rolname: 'demo_reader', rolbypassrls: false, rolsuper: false },
      ]);

      expect(await roleReferences(admin, 'stynx')).toEqual({
        owned: 0,
        granted: 0,
        policies: 0,
        routines: 0,
        policyExpressions: 0,
      });
      const demo = await roleReferences(admin, 'demo');
      expect(demo.owned).toBeGreaterThan(0);
      expect(demo.granted).toBeGreaterThan(0);
      expect(demo.policies).toBeGreaterThan(0);

      // The ledger records the immutable file, not the substituted SQL.
      const ledger = await admin.query<{ id: string; checksum: string }>(
        `select id, checksum from core.schema_migrations where id = '0001_roles.sql'`,
      );
      expect(ledger.rows).toEqual([{ id: '0001_roles.sql', checksum: await roleChecksum() }]);
      const owner = await admin.query<{ owner: string }>(
        `select pg_get_userbyid(nspowner)::text as owner from pg_namespace where nspname = 'core'`,
      );
      expect(owner.rows).toEqual([{ owner: 'demo_owner' }]);

      expect(await currentAppUser(moduleRef)).toBe('demo_app');
      await expectTenantIsolation(postgres, 'demo_app');
    } finally {
      await moduleRef?.close();
      await admin.end();
      await postgres.dispose();
    }
  });
});
