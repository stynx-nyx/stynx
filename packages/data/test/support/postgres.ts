import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { applyRolePrefix, DEFAULT_ROLE_PREFIX, platformRoleNames } from '../../src/platform-roles.js';

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

  const socketUri = `postgresql://${encodeURIComponent(login.user)}@/${encodeURIComponent(database)}?host=${encodeURIComponent(localSocketDir())}&application_name=${encodeURIComponent(applicationName)}`;
  return login.password === undefined
    ? socketUri
    : withPostgresCredentials(socketUri, { user: login.user, password: login.password });
}

/** Rewrites a test connection string so the pool logs in as `role` (default `stynx_app`). */
export function asAppRole(connectionString: string, role = TEST_APP_ROLE): string {
  return withPostgresCredentials(connectionString, { user: role, password: roleLoginPassword() });
}

/** Rebinds explicit fixture credentials without changing the PostgreSQL endpoint. */
export function withPostgresCredentials(
  connectionString: string,
  login: { readonly user: string; readonly password: string },
): string {
  // WHATWG URL rejects PostgreSQL's empty-host Unix socket authority. Keep
  // that authority (and IPv6 hosts) intact instead of inventing a TCP host.
  const parts = /^(postgres(?:ql)?:\/\/)([^/?#]*)([^?#]*)(?:\?([^#]*))?(#.*)?$/u.exec(
    connectionString,
  );
  if (!parts) throw new TypeError('Expected PostgreSQL connection URI');
  const [, scheme, authority = '', pathname = '', query, fragment = ''] = parts;
  const host = authority.slice(authority.lastIndexOf('@') + 1);
  const parameters = new URLSearchParams(query);
  // pg gives these parameters precedence over URI credentials. Overriding
  // the login must not accidentally retain a privileged query-string user.
  parameters.delete('user');
  parameters.delete('password');
  const remainingQuery = parameters.toString();
  return `${scheme}${encodeURIComponent(login.user)}:${encodeURIComponent(login.password)}@${host}${pathname}${remainingQuery ? `?${remainingQuery}` : ''}${fragment}`;
}

/** Bootstrap only cluster roles; leave the fresh database migration ledger untouched. */
async function bootstrapRoles(client: Client, rolePrefix: string): Promise<void> {
  await client.query('begin');
  try {
    // Execute the real immutable migration on this fixture database: its
    // current_database() grants must never target the admin database. These
    // grants are needed even when the cluster already has the shared roles.
    // A product prefix is applied the way the migration runners apply it.
    const sql = await readFile(
      resolve(__dirname, '../../migrations/platform/0001_roles.sql'),
      'utf8',
    );
    await client.query(applyRolePrefix(sql, rolePrefix));
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  }
}

/**
 * Gives an existing cluster role a login password so a pool can connect as
 * that role itself (`session_user = current_user`). Idempotent; a role the
 * cluster does not have yet (fresh cluster before `0001_roles.sql`) is skipped.
 */
async function ensureRoleLogin(client: Client, role: string): Promise<void> {
  await withRoleCatalogLock(client, () => setRoleLogin(client, role));
}

/** Caller holds the common admin-database lock over this shared catalog mutation. */
async function setRoleLogin(client: Client, role: string): Promise<void> {
  const exists = await client.query('select 1 from pg_roles where rolname = $1', [role]);
  if (exists.rowCount === 0) return;
  await client.query(
    `alter role ${client.escapeIdentifier(role)} with login password ${client.escapeLiteral(roleLoginPassword())}`,
  );
}

async function withRoleCatalogLock<T>(client: Client, operation: () => Promise<T>): Promise<T> {
  // Advisory locks are database-scoped. Every caller must use the common
  // postgres admin database, even while bootstrap SQL runs on its own DB.
  await client.query('begin');
  try {
    await client.query(`select pg_advisory_xact_lock(hashtext('stynx_test_role_login'))`);
    const result = await operation();
    await client.query('commit');
    return result;
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
  /**
   * Product role prefix the fixture bootstraps (S-18); default `stynx`. A
   * non-default prefix never clones the STYNX-migrated template.
   */
  readonly rolePrefix?: string;
}

export async function createPostgresTestDatabase(
  prefix = 'stynx_data',
  options: PostgresTestDatabaseOptions = {},
): Promise<PostgresTestDatabase> {
  const database = databaseName(prefix);
  const rolePrefix = options.rolePrefix ?? DEFAULT_ROLE_PREFIX;
  const template =
    options.useTemplate === false || rolePrefix !== DEFAULT_ROLE_PREFIX
      ? undefined
      : templateDatabase();

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
    await withRoleCatalogLock(client, async () => {
      await withClient(adminConfig(database), (bootstrap) => bootstrapRoles(bootstrap, rolePrefix));
      await setRoleLogin(client, platformRoleNames(rolePrefix).app);
    });
  });

  return {
    database,
    connectionString(applicationName: string): string {
      return connectionString(database, applicationName);
    },
    appConnectionString(applicationName: string, role = TEST_APP_ROLE): string {
      return connectionString(database, applicationName, {
        user: role,
        password: roleLoginPassword(),
      });
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
