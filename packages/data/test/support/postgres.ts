import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { Client, type ClientConfig } from 'pg';

function localSocketDir(): string {
  return process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp';
}

function localUser(): string {
  return process.env.STYNX_TEST_PG_USER ?? userInfo().username;
}

function localPort(): number {
  return Number(process.env.STYNX_TEST_PG_PORT ?? '5432');
}

function localPassword(): string | undefined {
  return process.env.STYNX_TEST_PG_PASSWORD;
}

function localHost(): string | undefined {
  return process.env.STYNX_TEST_PG_HOST;
}

/** Platform application role of `0001_roles.sql`; it logs in directly for app pools. */
export const TEST_APP_ROLE = 'stynx_app';

/**
 * Password bound to the login roles that app pools use. The maintainer's
 * test login is a superuser, which the ADR-OUTBOX-0003 D1 property check
 * refuses behind `SET ROLE`, so app pools log in as the role itself.
 */
function roleLoginPassword(): string {
  return localPassword() ?? 'stynx_test_role';
}

function databaseName(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

/**
 * Optional migrated template database (ADR-CI-ECONOMY Decision 6a). When
 * set (the CI tier gate exports it after running
 * scripts/ci-local/prepare-int-template.mjs), new test databases are cloned
 * from the already-migrated template instead of being created empty, so the
 * per-suite StynxDataModule migration pass no-ops instead of replaying the
 * full platform migration set concurrently with every other suite.
 */
function templateDatabase(): string | undefined {
  const template = process.env.STYNX_TEST_PG_TEMPLATE;
  return template && template.length > 0 ? template : undefined;
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

  return {
    host: localSocketDir(),
    user: localUser(),
    database,
  };
}

function connectionString(
  database: string,
  applicationName: string,
  login: { user: string; password?: string } = { user: localUser(), password: localPassword() },
): string {
  const host = localHost();
  if (host) {
    const url = new URL(
      `postgresql://${encodeURIComponent(login.user)}@${host}:${localPort()}/${database}`,
    );
    if (login.password) {
      url.password = login.password;
    }
    url.searchParams.set('application_name', applicationName);
    return url.toString();
  }

  return `postgresql://${encodeURIComponent(login.user)}@/${encodeURIComponent(database)}?host=${encodeURIComponent(localSocketDir())}&application_name=${encodeURIComponent(applicationName)}`;
}

/** Rewrites a test connection string so the pool logs in as `role` (default `stynx_app`). */
export function asAppRole(connectionString: string, role = TEST_APP_ROLE): string {
  const url = new URL(connectionString);
  url.username = role;
  url.password = roleLoginPassword();
  return url.toString();
}

/**
 * Gives an existing cluster role a login password so a pool can connect as
 * that role itself (`session_user = current_user`). Idempotent; a role the
 * cluster does not have yet (fresh cluster before `0001_roles.sql`) is skipped.
 */
async function ensureRoleLogin(client: Client, role: string): Promise<void> {
  const exists = await client.query('select 1 from pg_roles where rolname = $1', [role]);
  if (exists.rowCount === 0) return;
  // Suites run in parallel against one cluster; serialize the shared catalog row.
  await client.query('begin');
  try {
    await client.query(`select pg_advisory_xact_lock(hashtext('stynx_test_role_login'))`);
    await client.query(
      `alter role ${client.escapeIdentifier(role)} with login password ${client.escapeLiteral(roleLoginPassword())}`,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
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

export interface PostgresTestDatabase {
  readonly database: string;
  connectionString(applicationName: string): string;
  /** Connection string that logs in as `role` (default `stynx_app`) rather than the test login. */
  appConnectionString(applicationName: string, role?: string): string;
  /** Binds the login password to a role created after the database (test-created roles). */
  ensureRoleLogin(role: string): Promise<void>;
  adminConnectionString(applicationName: string): string;
  connectAsAdmin(): Promise<Client>;
  dispose(): Promise<void>;
}

export interface PostgresTestDatabaseOptions {
  readonly useTemplate?: boolean;
}

export async function createPostgresTestDatabase(
  prefix = 'stynx_data',
  options: PostgresTestDatabaseOptions = {},
): Promise<PostgresTestDatabase> {
  const database = databaseName(prefix);
  const template = options.useTemplate === false ? undefined : templateDatabase();

  await withClient(adminConfig(), async (client) => {
    if (template) {
      await client.query(`create database "${database}" template "${template}"`);
      // CREATE DATABASE ... TEMPLATE copies database contents but not the
      // source database's pg_database ACL. The platform migrations therefore
      // no-op on the clone without replaying the database-level grants from
      // 0001_roles.sql, leaving the runtime pools unable to connect or create
      // schemas. Reapply that existing contract to every migrated clone.
      await client.query(`grant connect, create on database "${database}" to stynx_owner`);
      await client.query(`grant connect on database "${database}" to stynx_app, stynx_reader`);
    } else {
      await client.query(`create database "${database}"`);
    }
    await ensureRoleLogin(client, TEST_APP_ROLE);
  });

  return {
    database,
    connectionString(applicationName: string): string {
      return connectionString(database, applicationName);
    },
    appConnectionString(applicationName: string, role = TEST_APP_ROLE): string {
      return connectionString(database, applicationName, { user: role, password: roleLoginPassword() });
    },
    async ensureRoleLogin(role: string): Promise<void> {
      await withClient(adminConfig(), (client) => ensureRoleLogin(client, role));
    },
    adminConnectionString(applicationName: string): string {
      return connectionString(database, applicationName);
    },
    async connectAsAdmin(): Promise<Client> {
      const client = new Client(adminConfig(database));
      await client.connect();
      return client;
    },
    async dispose(): Promise<void> {
      await withClient(adminConfig(), async (client) => {
        await client.query(
          `
            select pg_terminate_backend(pid)
            from pg_stat_activity
            where datname = $1
              and pid <> pg_backend_pid()
          `,
          [database],
        );
        await client.query(`drop database if exists "${database}"`);
      });
    },
  };
}
