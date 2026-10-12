import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { userInfo } from 'node:os';
import { Client, type ClientConfig } from 'pg';

function config(database = 'postgres'): ClientConfig {
  return {
    host: process.env.STYNX_TEST_PG_HOST ?? process.env.STYNX_TEST_PG_SOCKET_DIR ?? '/tmp',
    port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
    user: process.env.STYNX_TEST_PG_USER ?? userInfo().username,
    password: process.env.STYNX_TEST_PG_PASSWORD,
    database,
  };
}
const password = () => process.env.STYNX_TEST_PG_PASSWORD ?? 'stynx_test_role';
function url(database: string, applicationName: string, role?: string): string {
  const cfg = config(database);
  const uri = new URL(
    `postgresql://${encodeURIComponent(role ?? String(cfg.user))}@localhost:${cfg.port}/${database}`,
  );
  const secret = role ? password() : cfg.password;
  if (typeof secret === 'string') uri.password = secret;
  if (String(cfg.host).startsWith('/')) uri.searchParams.set('host', String(cfg.host));
  else uri.hostname = String(cfg.host);
  uri.searchParams.set('application_name', applicationName);
  return uri.toString();
}
async function connected(database = 'postgres') {
  const client = new Client(config(database));
  await client.connect();
  return client;
}
export interface PostgresTestDatabase {
  database: string;
  connectionString(name: string): string;
  appConnectionString(name: string, role?: string): string;
  ensureRoleLogin(role: string): Promise<void>;
  connectAsAdmin(): Promise<Client>;
  dispose(): Promise<void>;
}
export async function createPostgresTestDatabase(
  prefix: string,
  _options: { useTemplate: false },
): Promise<PostgresTestDatabase> {
  const database = prefix + '_' + randomUUID().replaceAll('-', '').slice(0, 16);
  const admin = await connected();
  try {
    await admin.query(`create database "${database}"`);
    // Match the established shared catalog lock, but execute only packed migration bytes.
    await admin.query('begin');
    await admin.query("select pg_advisory_xact_lock(hashtext('stynx_test_role_login'))");
    const target = await connected(database);
    try {
      const migration = resolve(
        dirname(require.resolve('@stynx-nyx/data')),
        '../../../migrations/platform/0001_roles.sql',
      );
      await target.query(readFileSync(migration, 'utf8'));
    } finally {
      await target.end();
    }
    for (const role of ['stynx_app', 'stynx_reader'])
      await admin.query(
        `alter role ${admin.escapeIdentifier(role)} login password ${admin.escapeLiteral(password())}`,
      );
    await admin.query('commit');
  } catch (error) {
    await admin.query('rollback').catch(() => {});
    throw error;
  } finally {
    await admin.end();
  }
  return {
    database,
    connectionString: (name) => url(database, name),
    appConnectionString: (name, role = 'stynx_app') => url(database, name, role),
    async ensureRoleLogin(role) {
      const client = await connected();
      try {
        await client.query('begin');
        await client.query("select pg_advisory_xact_lock(hashtext('stynx_test_role_login'))");
        await client.query(
          `alter role ${client.escapeIdentifier(role)} login password ${client.escapeLiteral(password())}`,
        );
        await client.query('commit');
      } catch (error) {
        await client.query('rollback').catch(() => {});
        throw error;
      } finally {
        await client.end();
      }
    },
    connectAsAdmin: () => connected(database),
    async dispose() {
      const client = await connected();
      try {
        await client.query(
          'select pg_terminate_backend(pid) from pg_stat_activity where datname=$1 and pid<>pg_backend_pid()',
          [database],
        );
        await client.query(`drop database if exists "${database}"`);
      } finally {
        await client.end();
      }
    },
  };
}
