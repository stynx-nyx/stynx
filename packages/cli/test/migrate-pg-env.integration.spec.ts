import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client, type ClientConfig } from 'pg';
import { migrateUp } from '../src/migrate.js';

// SM-06 / 09 §1: the template's apply.sh runs `stynx migrate up --role-prefix
// <product>` with no URL on argv; the runner connects from the PG* environment
// alone. Runs against the STYNX_TEST_PG_* scratch PostgreSQL when configured.
const host = process.env.STYNX_TEST_PG_HOST;
const repoRoot = resolve(__dirname, '../../..');
const PG_KEYS = ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE', 'DATABASE_URL'] as const;

function adminConfig(database: string): ClientConfig {
  return {
    host: host!,
    port: Number(process.env.STYNX_TEST_PG_PORT ?? '5432'),
    user: process.env.STYNX_TEST_PG_USER,
    ...(process.env.STYNX_TEST_PG_PASSWORD ? { password: process.env.STYNX_TEST_PG_PASSWORD } : {}),
    database,
  };
}

async function withAdmin<T>(database: string, fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(adminConfig(database));
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

describe.skipIf(!host)('migrate up from the PG* environment (PostgreSQL)', () => {
  const database = `stynx_cli_pgenv_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const saved = new Map<string, string | undefined>();

  beforeAll(async () => {
    await withAdmin('postgres', (client) => client.query(`create database "${database}"`));
    for (const key of PG_KEYS) saved.set(key, process.env[key]);
    const config = adminConfig(database);
    process.env.PGHOST = String(config.host);
    process.env.PGPORT = String(config.port);
    process.env.PGUSER = String(config.user ?? '');
    if (config.password) process.env.PGPASSWORD = String(config.password);
    else delete process.env.PGPASSWORD;
    process.env.PGDATABASE = database;
    // Never read implicitly: an unreachable URL here must not be used.
    process.env.DATABASE_URL = 'postgresql://nobody@127.0.0.1:1/nowhere';
  });

  afterAll(async () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await withAdmin('postgres', async (client) => {
      await client.query(
        'select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()',
        [database],
      );
      await client.query(`drop database if exists "${database}"`);
    });
  });

  it('applies the platform migrations as demo_{owner,app,reader} with no connection URL', async () => {
    const applied = await migrateUp(repoRoot, undefined, false, { rolePrefix: 'demo' });
    expect(applied).toContain('0001_roles.sql');

    await withAdmin(database, async (client) => {
      const roles = await client.query<{ rolname: string; rolbypassrls: boolean }>(
        `select rolname::text, rolbypassrls from pg_roles
          where rolname in ('demo_owner', 'demo_app', 'demo_reader') order by rolname`,
      );
      expect(roles.rows).toEqual([
        { rolname: 'demo_app', rolbypassrls: false },
        { rolname: 'demo_owner', rolbypassrls: true },
        { rolname: 'demo_reader', rolbypassrls: false },
      ]);
      const owner = await client.query<{ owner: string }>(
        `select pg_get_userbyid(nspowner)::text as owner from pg_namespace where nspname = 'core'`,
      );
      expect(owner.rows).toEqual([{ owner: 'demo_owner' }]);
      const stynxGrants = await client.query<{ count: number }>(
        `select count(*)::int as count from pg_class c, aclexplode(c.relacl) a
          join pg_roles r on r.oid = a.grantee where r.rolname like 'stynx\\_%'`,
      );
      expect(stynxGrants.rows).toEqual([{ count: 0 }]);
      const ledger = await client.query<{ count: number }>(
        'select count(*)::int as count from core.schema_migrations',
      );
      expect(ledger.rows).toEqual([{ count: applied.length }]);
    });

    await expect(migrateUp(repoRoot, undefined, false, { rolePrefix: 'demo' })).resolves.toEqual([]);
  });
});
