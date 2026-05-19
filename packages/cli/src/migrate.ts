import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

export interface MigrationClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface MigrationClientFactoryOptions {
  connectionString: string;
}

export interface MigrationOptions {
  migrationDir?: string;
  clientFactory?: (options: MigrationClientFactoryOptions) => MigrationClient;
}

export interface MigrationStatus {
  applied: string[];
  pending: string[];
  rollbackable: string[];
}

export interface MigrationSpec {
  id: string;
  upPath: string;
  downPath?: string;
}

interface JournalRow {
  id: string;
}

function defaultClientFactory(options: MigrationClientFactoryOptions): MigrationClient {
  return new Client({ connectionString: options.connectionString }) as unknown as MigrationClient;
}

function migrationDirectory(rootDir: string, options?: MigrationOptions): string {
  return options?.migrationDir ?? resolve(rootDir, 'packages/data/migrations/platform');
}

function listMigrationSpecs(rootDir: string, options?: MigrationOptions): MigrationSpec[] {
  const dir = migrationDirectory(rootDir, options);
  const entries = readdirSync(dir).filter((entry) => entry.endsWith('.sql') && !entry.endsWith('.down.sql')).sort();
  return entries.map((entry) => {
    const downPath = join(dir, entry.replace(/\.sql$/u, '.down.sql'));
    return {
      id: entry,
      upPath: join(dir, entry),
      ...(existsSync(downPath) ? { downPath } : {}),
    };
  });
}

async function withClient<T>(
  connectionString: string,
  options: MigrationOptions | undefined,
  fn: (client: MigrationClient) => Promise<T>,
): Promise<T> {
  const client = (options?.clientFactory ?? defaultClientFactory)({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function ensureMigrationTables(client: MigrationClient): Promise<void> {
  await client.query('create schema if not exists core');
  await client.query(`
    create table if not exists core.schema_migrations (
      id text primary key,
      checksum text,
      applied_at timestamptz not null default clock_timestamp()
    )
  `);
  await client.query(`
    create table if not exists core.schema_migration_journal (
      seq bigserial primary key,
      id text not null,
      checksum text,
      direction text not null,
      executed_at timestamptz not null default clock_timestamp()
    )
  `);
}

async function appliedMigrationIds(client: MigrationClient): Promise<string[]> {
  const appliedRows = await client.query('select id from core.schema_migrations order by id');
  return (appliedRows.rows as Array<{ id: string }>).map((row) => row.id);
}

async function promoteBootstrapObjectsToOwner(client: MigrationClient): Promise<void> {
  await client.query('ALTER SCHEMA core OWNER TO stynx_owner');
  await client.query('ALTER TABLE core.schema_migrations OWNER TO stynx_owner');
  await client.query('ALTER TABLE core.schema_migration_journal OWNER TO stynx_owner');
  await client.query('SET ROLE stynx_owner');
}

async function latestAppliedIds(client: MigrationClient, limit: number): Promise<string[]> {
  const result = await client.query(
    `
      select id
      from core.schema_migrations
      order by applied_at desc, id desc
      limit $1
    `,
    [limit],
  );
  return (result.rows as JournalRow[]).map((row) => row.id);
}

function checksum(sql: string): string {
  return `${sql.length}:${Buffer.from(sql, 'utf8').toString('base64url').slice(0, 24)}`;
}

async function applyMigrationUp(client: MigrationClient, spec: MigrationSpec): Promise<void> {
  const sql = readFileSync(spec.upPath, 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query(
      `
        insert into core.schema_migrations (id, checksum, applied_at)
        values ($1, $2, clock_timestamp())
        on conflict (id) do update set checksum = excluded.checksum, applied_at = excluded.applied_at
      `,
      [spec.id, checksum(sql)],
    );
    await client.query(
      'insert into core.schema_migration_journal (id, checksum, direction) values ($1, $2, $3)',
      [spec.id, checksum(sql), 'up'],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function applyMigrationDown(client: MigrationClient, spec: MigrationSpec): Promise<void> {
  if (!spec.downPath) {
    throw new Error(`Migration ${spec.id} is not rollbackable: missing .down.sql pair`);
  }
  const sql = readFileSync(spec.downPath, 'utf8');
  await client.query('begin');
  try {
    await client.query(sql);
    await client.query('delete from core.schema_migrations where id = $1', [spec.id]);
    await client.query(
      'insert into core.schema_migration_journal (id, checksum, direction) values ($1, $2, $3)',
      [spec.id, checksum(sql), 'down'],
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function migrationStatus(
  rootDir: string,
  connectionString: string,
  options?: MigrationOptions,
): Promise<MigrationStatus> {
  return withClient(connectionString, options, async (client) => {
    await ensureMigrationTables(client);
    const specs = listMigrationSpecs(rootDir, options);
    const applied = await appliedMigrationIds(client);
    const pending = specs.map((spec) => spec.id).filter((id) => !applied.includes(id));
    const rollbackable = specs.filter((spec) => spec.downPath && applied.includes(spec.id)).map((spec) => spec.id);
    return { applied, pending, rollbackable };
  });
}

export async function migrateUp(
  rootDir: string,
  connectionString: string,
  dryRun = false,
  options?: MigrationOptions,
): Promise<string[]> {
  return withClient(connectionString, options, async (client) => {
    await ensureMigrationTables(client);
    const specs = listMigrationSpecs(rootDir, options);
    const applied = new Set(await appliedMigrationIds(client));
    const pending = specs.filter((spec) => !applied.has(spec.id));
    const ownerRoleApplied = applied.has('0002_extensions.sql');
    if (dryRun) {
      return pending.map((spec) => spec.id);
    }
    if (ownerRoleApplied) {
      await promoteBootstrapObjectsToOwner(client);
    }
    for (const spec of pending) {
      await applyMigrationUp(client, spec);
      if (spec.id === '0002_extensions.sql') {
        await promoteBootstrapObjectsToOwner(client);
      }
    }
    return pending.map((spec) => spec.id);
  });
}

export async function migrateDown(
  rootDir: string,
  connectionString: string,
  steps = 1,
  dryRun = false,
  options?: MigrationOptions,
): Promise<string[]> {
  return withClient(connectionString, options, async (client) => {
    await ensureMigrationTables(client);
    const specs = new Map(listMigrationSpecs(rootDir, options).map((spec) => [spec.id, spec]));
    const latest = await latestAppliedIds(client, steps);
    const targets = latest.map((id) => specs.get(id)).filter((value): value is MigrationSpec => value !== undefined);
    if (dryRun) {
      for (const target of targets) {
        if (!target.downPath) {
          throw new Error(`Migration ${target.id} is not rollbackable: missing .down.sql pair`);
        }
      }
      return targets.map((target) => target.id);
    }
    for (const target of targets) {
      await applyMigrationDown(client, target);
    }
    return targets.map((target) => target.id);
  });
}

export async function migrateRedo(
  rootDir: string,
  connectionString: string,
  dryRun = false,
  options?: MigrationOptions,
): Promise<{ down: string[]; up: string[] }> {
  const down = await migrateDown(rootDir, connectionString, 1, dryRun, options);
  if (dryRun) {
    return { down, up: down };
  }
  const specs = new Map(listMigrationSpecs(rootDir, options).map((spec) => [spec.id, spec]));
  await withClient(connectionString, options, async (client) => {
    await ensureMigrationTables(client);
    for (const id of down) {
      const spec = specs.get(id);
      if (!spec) {
        throw new Error(`Migration ${id} is missing from the migration directory`);
      }
      await applyMigrationUp(client, spec);
    }
  });
  return { down, up: down };
}

export function listMigrations(rootDir: string, options?: MigrationOptions): MigrationSpec[] {
  return listMigrationSpecs(rootDir, options);
}
