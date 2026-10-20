import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { type INestApplication } from '@nestjs/common';
import { RequestContextMutator } from '@stynx-nyx/core';
import {
  createStynxPgClient,
  Database,
  StynxDataModule,
  type StynxPgClient,
} from '@stynx-nyx/data';
import { DEFAULT_TEST_APP_ROLES, testAppRolePrefix, type TestAppRoleNames } from './roles.js';
import {
  describePostgresEndpoint,
  postgresLogin,
  postgresUriFor,
  resolveTestDatabaseUrl,
} from './runtime.js';
import type {
  CreateTestAppOptions,
  StartedCognitoHandle,
  StartedLocalstackHandle,
  StartedPostgresHandle,
  StartedRedisHandle,
  TestAppContext,
  TestSqlStep,
} from './types.js';

async function applySqlSteps(client: StynxPgClient, steps: TestSqlStep[]): Promise<void> {
  for (const step of steps) {
    if (typeof step === 'string') {
      await client.query(step);
      continue;
    }
    await step(client);
  }
}

const DEFAULT_REGION = 'us-east-1';
/** Login password bound to the app role when `DATABASE_URL` carries none. */
const DEFAULT_APP_ROLE_PASSWORD = 'stynx_test_role';

async function withClient<T>(
  connectionString: string,
  fn: (client: StynxPgClient) => Promise<T>,
): Promise<T> {
  const client = createStynxPgClient({ connectionString });
  try {
    await client.connect();
  } catch (error) {
    await client.end().catch(() => undefined);
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `createTestApp could not reach PostgreSQL at ${describePostgresEndpoint(connectionString)} ` +
        `(DATABASE_URL): ${reason}. Start PostgreSQL for the declared runtime.`,
      { cause: error },
    );
  }
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

/** A fresh database name; `rolePrefix` is a validated lower-case identifier. */
function testDatabaseName(rolePrefix: string): string {
  return `${rolePrefix}_testapp_${randomUUID().replace(/-/gu, '').slice(0, 16)}`;
}

function resolveLocalstack(options: CreateTestAppOptions['localstack']): StartedLocalstackHandle | undefined {
  if (options?.enabled === false) return undefined;
  if (!options?.endpoint) {
    if (options?.enabled === true) {
      throw new Error(
        'createTestApp starts no containers: localstack.enabled requires localstack.endpoint from the runtime',
      );
    }
    return undefined;
  }
  return { endpoint: options.endpoint, region: options.region ?? DEFAULT_REGION };
}

function resolveCognito(options: CreateTestAppOptions['cognito']): StartedCognitoHandle | undefined {
  if (options?.enabled === false) return undefined;
  if (!options?.endpoint) {
    if (options?.enabled === true) {
      throw new Error(
        'createTestApp starts no containers: cognito.enabled requires cognito.endpoint from the runtime',
      );
    }
    return undefined;
  }
  return {
    endpoint: options.endpoint,
    region: options.region ?? DEFAULT_REGION,
    userPoolId: options.userPoolId ?? 'local_testing_pool',
    clientId: options.clientId ?? 'local_testing_client',
  };
}

/**
 * ADR-OUTBOX-0003 D1 refuses an application pool whose `current_user` is not
 * the application role or whose login is privileged, so the admin login of
 * `DATABASE_URL` cannot serve the app pool. Create the application role ahead
 * of the platform migrations (which keep it: `0001_roles.sql` is
 * `IF NOT EXISTS`) and bind its login password. Roles are cluster-wide, so
 * the bind is serialized and its password is the one every suite on this
 * server uses: the password of `DATABASE_URL`, else `stynx_test_role`.
 * `appRole` is a validated lower-case identifier (`testAppRolePrefix`).
 */
async function bindApplicationRoleLogin(
  maintenanceUrl: string,
  appRole: string,
  password: string,
): Promise<void> {
  await withClient(maintenanceUrl, async (client) => {
    await client.query('begin');
    try {
      await client.query(`select pg_advisory_xact_lock(hashtext('@stynx-nyx/testing:role-login'))`);
      await client.query(`do $$
      begin
        if not exists (select 1 from pg_catalog.pg_roles where rolname = '${appRole}') then
          create role ${appRole} login noinherit nobypassrls;
        end if;
      end $$`);
      await client.query(`alter role ${appRole} with login password ${sqlLiteral(password)}`);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => undefined);
      throw error;
    }
  });
}

async function createDatabase(maintenanceUrl: string, database: string): Promise<void> {
  await withClient(maintenanceUrl, async (client) => {
    await client.query(`create database "${database}"`);
  });
}

async function dropDatabase(maintenanceUrl: string, database: string): Promise<void> {
  await withClient(maintenanceUrl, async (client) => {
    await client.query(
      'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
      [database],
    );
    await client.query(`drop database if exists "${database}"`);
  });
}

/**
 * Boots an isolated NestJS test app on the PostgreSQL server the runtime
 * supplies through `DATABASE_URL` (02 §6, D-011): bare or docker, the URL is
 * the harness's or rail's. It creates a fresh database there, binds the app
 * role login, runs the platform migrations as the given product roles and
 * drops the database on teardown. It starts no container; without
 * `DATABASE_URL` it fails closed.
 */
export async function createTestApp(options: CreateTestAppOptions = {}): Promise<TestAppContext> {
  const roles: TestAppRoleNames = options.roles ?? DEFAULT_TEST_APP_ROLES;
  const rolePrefix = testAppRolePrefix(roles);
  const maintenanceUrl = resolveTestDatabaseUrl();
  const localstack = resolveLocalstack(options.localstack);
  const cognito = resolveCognito(options.cognito);
  const redis: StartedRedisHandle | undefined = options.redis ? { url: options.redis.url } : undefined;
  const appRolePassword = postgresLogin(maintenanceUrl).password ?? DEFAULT_APP_ROLE_PASSWORD;
  const databaseName = testDatabaseName(rolePrefix);
  let created = false;
  let testingModule;
  let app: INestApplication | undefined;

  try {
    await bindApplicationRoleLogin(maintenanceUrl, roles.app, appRolePassword);
    await createDatabase(maintenanceUrl, databaseName);
    created = true;

    const adminUrl = postgresUriFor(maintenanceUrl, databaseName, '@stynx-nyx/testing:admin');
    const postgres: StartedPostgresHandle = {
      database: databaseName,
      connectionString: adminUrl,
      adminConnectionString: adminUrl,
    };

    testingModule = await Test.createTestingModule({
      imports: [
        StynxDataModule.forRoot({
          connections: {
            owner: {
              connectionString: postgresUriFor(maintenanceUrl, databaseName, '@stynx-nyx/testing:owner'),
            },
            app: {
              connectionString: postgresUriFor(maintenanceUrl, databaseName, '@stynx-nyx/testing:app', {
                user: roles.app,
                password: appRolePassword,
              }),
            },
            reader: {
              connectionString: postgresUriFor(maintenanceUrl, databaseName, '@stynx-nyx/testing:reader'),
            },
          },
          migrations: { enabled: true, rolePrefix },
          appRoleName: roles.app,
        }),
        ...(options.overrides?.imports ?? []),
      ],
      controllers: options.overrides?.controllers ?? [],
      providers: options.overrides?.providers ?? [],
    }).compile();

    app = testingModule.createNestApplication();
    await app.init();

    async function adminClient(): Promise<StynxPgClient> {
      const client = createStynxPgClient({ connectionString: adminUrl });
      await client.connect();
      return client;
    }

    if ((options.migrations?.length ?? 0) > 0 || (options.seeds?.length ?? 0) > 0) {
      const client = await adminClient();
      try {
        if (options.migrations) {
          await applySqlSteps(client, options.migrations);
        }
        if (options.seeds) {
          await applySqlSteps(client, options.seeds);
        }
      } finally {
        await client.end();
      }
    }

    const database = testingModule.get(Database);
    const requestContextMutator = testingModule.get(RequestContextMutator);
    const startedApp = app;

    return {
      app,
      moduleRef: testingModule,
      database,
      requestContextMutator,
      postgres,
      ...(redis ? { redis } : {}),
      ...(localstack ? { localstack } : {}),
      ...(cognito ? { cognito } : {}),
      adminClient,
      async tx<T>(fn: (trx: import('@stynx-nyx/data').Transaction) => Promise<T>) {
        return database.withSystemContext('stynx testing harness', async () =>
          database.tx(fn, {
            role: 'owner',
            readonly: false,
            replica: false,
          }),
        );
      },
      async teardown(): Promise<void> {
        await startedApp.close();
        await dropDatabase(maintenanceUrl, databaseName);
      },
    };
  } catch (error) {
    await app?.close().catch(() => undefined);
    if (created) {
      await dropDatabase(maintenanceUrl, databaseName).catch(() => undefined);
    }
    throw error;
  }
}
