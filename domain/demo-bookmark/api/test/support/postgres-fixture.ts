// C-4 Session F-9 step 2/N — per-task-DB fixture for demo-bookmark
//
// Mirrors packages/data/test/support/postgres.ts at the surface but is
// duplicated here because that helper is not exported from @stynx/data.
// Adds demo-bookmark migration application on top of the StynxDataModule
// platform-migration boot.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { Test, type TestingModule } from '@nestjs/testing';
import { Client, type ClientConfig } from 'pg';
import { Database, StynxDataModule } from '@stynx/data';
// StynxMigrationRunner isn't re-exported from @stynx/data's public index;
// reach into the package source via the workspace symlink. F-9 step 2/N
// could also be unblocked by re-exporting the class from packages/data/src/index.ts,
// but that's a @stynx/data API change out of scope for this commit.
import { StynxMigrationRunner } from '../../../../../packages/data/src/migration-runner';
import { RequestContextMutator } from '@stynx/core';

function localUser(): string {
  return process.env.STYNX_TEST_PG_USER ?? userInfo().username;
}

function localPort(): number {
  return Number(process.env.STYNX_TEST_PG_PORT ?? '5432');
}

function localHost(): string | undefined {
  return process.env.STYNX_TEST_PG_HOST;
}

function localPassword(): string | undefined {
  return process.env.STYNX_TEST_PG_PASSWORD;
}

function localSocketDir(): string {
  return process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp';
}

function databaseName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

function adminConfig(database = 'postgres'): ClientConfig {
  const host = localHost();
  if (host) {
    return {
      host,
      port: localPort(),
      user: localUser(),
      password: localPassword(),
      database,
    };
  }
  return { host: localSocketDir(), user: localUser(), database };
}

function connectionStringFor(database: string, applicationName: string): string {
  const host = localHost();
  if (host) {
    const url = new URL(`postgresql://${encodeURIComponent(localUser())}@${host}:${localPort()}/${database}`);
    const password = localPassword();
    if (password) url.password = password;
    url.searchParams.set('application_name', applicationName);
    return url.toString();
  }
  return `postgresql://${encodeURIComponent(localUser())}@/${encodeURIComponent(database)}?host=${encodeURIComponent(localSocketDir())}&application_name=${encodeURIComponent(applicationName)}`;
}

async function withClient<T>(config: ClientConfig, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(config);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export interface DemoBookmarkFixture {
  readonly database: string;
  readonly module: TestingModule;
  readonly db: Database;
  readonly requestContextMutator: RequestContextMutator;
  readonly tenantA: string;
  readonly tenantB: string;
  readonly userA: string;
  readonly userB: string;
  runAs<T>(tenantId: string, actorId: string, fn: (db: Database) => Promise<T>): Promise<T>;
  dispose(): Promise<void>;
}

/**
 * Build a fresh Postgres DB, boot the Stynx platform schema via
 * StynxDataModule.forRoot({migrations:{enabled:true}}), then apply the
 * demo-bookmark migration on top. Seeds two tenants + two users for the
 * cross-tenant FK satisfaction tests. Returns a fixture handle the test
 * disposes in afterAll.
 */
export async function createDemoBookmarkFixture(): Promise<DemoBookmarkFixture> {
  const database = databaseName('stynx_demo_bookmark');

  await withClient(adminConfig(), async (client) => {
    await client.query(`create database "${database}"`);
  });

  const cs = connectionStringFor(database, 'demo-bookmark-test');
  const module = await Test.createTestingModule({
    imports: [
      StynxDataModule.forRoot({
        connections: {
          owner: { connectionString: cs },
          app: { connectionString: cs },
          reader: { connectionString: cs },
        },
        migrations: { enabled: true },
      }),
    ],
  }).compile();
  await module.init();

  // module.init() runs StynxMigrationRunner.onModuleInit which auto-runs
  // platform migrations when {migrations: {enabled: true}} is set. Call it
  // again explicitly as a defensive no-op — idempotent and makes the test
  // setup ordering obvious to readers.
  const migrationRunner = module.get(StynxMigrationRunner);
  await migrationRunner.runPlatformMigrations();

  // Apply demo-bookmark's migration on top of the freshly-booted platform.
  // Use stynx_owner so demo schema + tables are owned consistently with the
  // migration-runner output for the platform schemas.
  const migrationPath = join(__dirname, '..', '..', '..', 'db', 'migration.sql');
  const migrationSql = readFileSync(migrationPath, 'utf8');
  await withClient(adminConfig(database), async (client) => {
    await client.query('set role stynx_owner');
    await client.query(migrationSql);
    await client.query('reset role');
  });

  // Seed two tenants + two users for cross-tenant tests.
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const userA = randomUUID();
  const userB = randomUUID();

  await withClient(adminConfig(database), async (client) => {
    await client.query('set role stynx_app');
    // Tenants — RLS requires app.tenant_id; seed with the row's own id.
    await client.query('begin');
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantA]);
    await client.query(`insert into tenancy.tenants (id, slug, name) values ($1, $2, $3)`, [
      tenantA,
      `t-${tenantA.slice(0, 8)}`,
      'Tenant A',
    ]);
    await client.query('commit');

    await client.query('begin');
    await client.query(`select set_config('app.tenant_id', $1, true)`, [tenantB]);
    await client.query(`insert into tenancy.tenants (id, slug, name) values ($1, $2, $3)`, [
      tenantB,
      `t-${tenantB.slice(0, 8)}`,
      'Tenant B',
    ]);
    await client.query('commit');

    // Users — auth.users is tenant-agnostic (no tenant_id column).
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
      userA,
      `${userA.slice(0, 8)}@a.test`,
    ]);
    await client.query(`insert into auth.users (id, email) values ($1, $2)`, [
      userB,
      `${userB.slice(0, 8)}@b.test`,
    ]);
    await client.query('reset role');
  });

  const db = module.get(Database);
  const requestContextMutator = module.get(RequestContextMutator);

  return {
    database,
    module,
    db,
    requestContextMutator,
    tenantA,
    tenantB,
    userA,
    userB,
    async runAs<T>(tenantId: string, actorId: string, fn: (db: Database) => Promise<T>): Promise<T> {
      return requestContextMutator.runWithRequestContext(
        {
          requestId: randomUUID(),
          tenantId,
          actorId,
          startedAt: new Date(),
        },
        () => fn(db),
      );
    },
    async dispose(): Promise<void> {
      await module.close();
      await withClient(adminConfig(), async (client) => {
        await client.query(
          `select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()`,
          [database],
        );
        await client.query(`drop database if exists "${database}"`);
      });
    },
  };
}
