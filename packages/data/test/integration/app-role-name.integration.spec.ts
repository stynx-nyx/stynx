import { randomUUID } from 'node:crypto';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Client } from 'pg';
import { StynxDataModule } from '../../src/data.module';
import { Database } from '../../src/database';
import { AppRoleConfigurationError, TransactionIdentityMismatchError } from '../../src/errors';
import type { StynxDataModuleOptions } from '../../src/tokens';
import { createPostgresTestDatabase, type PostgresTestDatabase } from '../support/postgres';

// INV-RBAC-001; UPS-OBX-10 (ADR-OUTBOX-0003 D1): the application SQL role is
// configuration, a conforming role other than stynx_app is accepted, a role
// that is not the configured one is refused with a typed reason, and the
// property check prevents startup for privileged roles on real PostgreSQL.
const TENANT = 'c1111111-1111-4111-8111-111111111111';
const ACTOR = 'c2222222-2222-4222-8222-222222222222';
const suffix = () => randomUUID().replace(/-/g, '').slice(0, 12);
const asRole = (url: string, role: string) =>
  `${url}&options=${encodeURIComponent(`-c role=${role}`)}`;

interface Identity {
  current_user: string;
  session_user: string;
  app_role: string | null;
}

describe('StynxDataModule configurable application role (PostgreSQL)', () => {
  let postgres: PostgresTestDatabase;
  let admin: Client;
  const roles: string[] = [];
  const modules: TestingModule[] = [];

  async function createRole(prefix: string, attributes: string): Promise<string> {
    const role = `${prefix}_${suffix()}`;
    await admin.query(`create role ${admin.escapeIdentifier(role)} ${attributes}`);
    await admin.query(
      `grant connect on database ${admin.escapeIdentifier(postgres.database)} to ${admin.escapeIdentifier(role)}`,
    );
    await postgres.ensureRoleLogin(role);
    roles.push(role);
    return role;
  }

  async function compile(
    options: Partial<StynxDataModuleOptions> & { app: string },
  ): Promise<TestingModule> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: { connectionString: postgres.connectionString('app-role-owner') },
            app: { connectionString: options.app, max: 2 },
            reader: {
              connectionString: asRole(
                postgres.connectionString('app-role-reader'),
                'stynx_reader',
              ),
            },
          },
          retry: false,
          ...(options.appRoleName ? { appRoleName: options.appRoleName } : {}),
          ...(options.migrations ? { migrations: options.migrations } : {}),
        }),
      ],
    }).compile();
    modules.push(moduleRef);
    return moduleRef;
  }

  async function identity(database: Database): Promise<Identity> {
    return database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        async (trx) => {
          const row = await trx.query<Identity>(
            `select current_user::text, session_user::text, current_setting('app.role', true) as app_role`,
          );
          return row.rows[0]!;
        },
        { requireActor: true, retry: false },
      ),
    );
  }

  async function expectStartupRefused(
    options: Partial<StynxDataModuleOptions> & { app: string },
    property: string,
  ): Promise<void> {
    const moduleRef = await compile(options);
    let failure: unknown;
    try {
      await moduleRef.init();
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(AppRoleConfigurationError);
    expect(failure).toMatchObject({
      code: 'APP_ROLE_CONFIGURATION',
      property,
      context: { property },
    });
    expect(JSON.stringify((failure as AppRoleConfigurationError).context)).not.toMatch(
      /password|@/u,
    );
  }

  beforeAll(async () => {
    postgres = await createPostgresTestDatabase('stynx_data_app_role');
    admin = await postgres.connectAsAdmin();
    await admin.query(
      `insert into tenancy.tenants (id, slug, name) values ($1::uuid, 'app-role', 'App role')
       on conflict do nothing`,
      [TENANT],
    );
  }, 90_000);

  afterAll(async () => {
    for (const moduleRef of modules.reverse()) await moduleRef.close().catch(() => undefined);
    for (const role of roles) {
      await admin.query(`drop owned by ${admin.escapeIdentifier(role)}`).catch(() => undefined);
      await admin
        .query(`drop role if exists ${admin.escapeIdentifier(role)}`)
        .catch(() => undefined);
    }
    await admin.end();
    await postgres.dispose();
  }, 60_000);

  it('keeps the default behaviour under stynx_app without the option', async () => {
    const moduleRef = await compile({
      app: postgres.appConnectionString('app-role-default'),
      migrations: { enabled: true },
    });
    await moduleRef.init();
    const database = moduleRef.get(Database);
    expect(database.appRoleName).toBe('stynx_app');
    await expect(identity(database)).resolves.toEqual({
      current_user: 'stynx_app',
      session_user: 'stynx_app',
      app_role: 'app',
    });
  }, 120_000);

  it('honours a custom role name for requireActor transactions and refuses another SQL role typed', async () => {
    const role = await createRole('stynx_obx10_app', 'login nosuperuser nobypassrls noinherit');
    await admin.query(`grant stynx_app to ${admin.escapeIdentifier(role)}`);
    const moduleRef = await compile({
      app: postgres.appConnectionString('app-role-custom', role),
      appRoleName: role,
    });
    await moduleRef.init();
    const database = moduleRef.get(Database);
    expect(database.appRoleName).toBe(role);
    await expect(identity(database)).resolves.toEqual({
      current_user: role,
      session_user: role,
      app_role: 'app',
    });

    const nested = vi.fn(async () => 'unreached');
    let failure: unknown;
    await database.withRequestContext({ tenantId: TENANT, actorId: ACTOR }, () =>
      database.tx(
        async (trx) => {
          await trx.query('set role stynx_app');
          try {
            await database.tx(nested, { requireActor: true, retry: false });
          } catch (error) {
            failure = error;
          }
          await trx.query('reset role');
        },
        { retry: false },
      ),
    );
    expect(nested).not.toHaveBeenCalled();
    expect(failure).toBeInstanceOf(TransactionIdentityMismatchError);
    expect(failure).toMatchObject({
      code: 'TRANSACTION_IDENTITY_MISMATCH',
      mismatch: 'sql_role',
      context: { reason: 'live app identity mismatch', mismatch: 'sql_role' },
    });
  }, 60_000);

  it('prevents startup for a configured name that is not the connected role', async () => {
    await expectStartupRefused(
      { app: postgres.appConnectionString('app-role-mismatch'), appRoleName: 'role_app_backend' },
      'current_user',
    );
  }, 60_000);

  it('prevents startup for a superuser or BYPASSRLS application role, also behind SET ROLE', async () => {
    await expectStartupRefused(
      { app: postgres.connectionString('app-role-superuser') },
      'current_user',
    );
    const superuser = await createRole('stynx_obx10_su', 'login superuser');
    await expectStartupRefused(
      { app: postgres.appConnectionString('app-role-su-named', superuser), appRoleName: superuser },
      'rolsuper',
    );
    const bypass = await createRole('stynx_obx10_bypass', 'login nosuperuser bypassrls');
    await expectStartupRefused(
      { app: postgres.appConnectionString('app-role-bypass', bypass), appRoleName: bypass },
      'rolbypassrls',
    );
    await expectStartupRefused(
      { app: asRole(postgres.connectionString('app-role-set-role'), 'stynx_app') },
      'session_user.rolsuper',
    );
    const login = await createRole('stynx_obx10_login', 'login nosuperuser bypassrls noinherit');
    await admin.query(`grant stynx_app to ${admin.escapeIdentifier(login)}`);
    await expectStartupRefused(
      { app: asRole(postgres.appConnectionString('app-role-login-bypass', login), 'stynx_app') },
      'session_user.rolbypassrls',
    );
  }, 90_000);

  it('accepts a conforming login role behind SET ROLE', async () => {
    const login = await createRole('stynx_obx10_member', 'login nosuperuser nobypassrls noinherit');
    await admin.query(`grant stynx_app to ${admin.escapeIdentifier(login)}`);
    const moduleRef = await compile({
      app: asRole(postgres.appConnectionString('app-role-member', login), 'stynx_app'),
    });
    await moduleRef.init();
    await expect(identity(moduleRef.get(Database))).resolves.toEqual({
      current_user: 'stynx_app',
      session_user: login,
      app_role: 'app',
    });
  }, 60_000);

  it('does not skip the check when the application pool is unreachable at bootstrap', async () => {
    const late = `stynx_obx10_late_${suffix()}`;
    const moduleRef = await compile({
      app: asRole(postgres.connectionString('app-role-late'), late),
      appRoleName: late,
    });
    await moduleRef.init();
    const database = moduleRef.get(Database);
    await expect(identity(database)).rejects.toThrow(late);
    await admin.query(
      `create role ${admin.escapeIdentifier(late)} nologin nosuperuser nobypassrls`,
    );
    roles.push(late);
    await expect(identity(database)).rejects.toMatchObject({
      code: 'APP_ROLE_CONFIGURATION',
      property: 'session_user.rolsuper',
    });
  }, 60_000);
});
