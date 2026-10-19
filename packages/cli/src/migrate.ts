import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Client } from 'pg';

export interface MigrationClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface MigrationClientFactoryOptions {
  /**
   * PostgreSQL URL. Absent when none was given: the client then connects with
   * node-postgres defaults from the `PG*` environment (PGHOST, PGPORT, PGUSER,
   * PGPASSWORD, PGDATABASE), so no credential needs to appear on argv.
   */
  connectionString?: string;
}

export interface MigrationOptions {
  migrationDir?: string;
  /**
   * Product role prefix (S-18): the platform roles become `<prefix>_owner`,
   * `<prefix>_app` and `<prefix>_reader` at apply time. Default `'stynx'`,
   * which applies the files byte for byte.
   */
  rolePrefix?: string;
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

/** Role prefix the platform migration files are written with. */
const DEFAULT_ROLE_PREFIX = 'stynx';
const ROLE_PREFIX_PATTERN = /^[a-z_][a-z0-9_]*$/u;
/** `NAMEDATALEN - 1` minus the longest suffix, `_reader`. */
const ROLE_PREFIX_MAX_LENGTH = 63 - '_reader'.length;
/** Exactly the platform role identifiers; schema names and other `stynx` text are untouched. */
const PLATFORM_ROLE_IDENTIFIER = /\bstynx_(owner|app|reader)\b/gu;

function rolePrefixOf(options?: MigrationOptions): string {
  const prefix = options?.rolePrefix ?? DEFAULT_ROLE_PREFIX;
  if (prefix.length > ROLE_PREFIX_MAX_LENGTH || !ROLE_PREFIX_PATTERN.test(prefix)) {
    throw new TypeError(
      `Invalid role prefix: expected a lower-case PostgreSQL identifier of at most ${ROLE_PREFIX_MAX_LENGTH} characters`,
    );
  }
  return prefix;
}

/** Rewrites the platform role identifiers of `sql` to `prefix`; the default prefix is the identity. */
function applyRolePrefix(sql: string, prefix: string): string {
  return prefix === DEFAULT_ROLE_PREFIX
    ? sql
    : sql.replace(PLATFORM_ROLE_IDENTIFIER, (_identifier, role: string) => `${prefix}_${role}`);
}

function defaultClientFactory(options: MigrationClientFactoryOptions): MigrationClient {
  return new Client(
    options.connectionString === undefined ? {} : { connectionString: options.connectionString },
  ) as unknown as MigrationClient;
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
  connectionString: string | undefined,
  options: MigrationOptions | undefined,
  fn: (client: MigrationClient) => Promise<T>,
): Promise<T> {
  const client = (options?.clientFactory ?? defaultClientFactory)(
    connectionString === undefined ? {} : { connectionString },
  );
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

async function promoteBootstrapObjectsToOwner(client: MigrationClient, prefix: string): Promise<void> {
  // `prefix` is a validated lower-case identifier (rolePrefixOf).
  const owner = `${prefix}_owner`;
  await client.query(`ALTER SCHEMA core OWNER TO ${owner}`);
  await client.query(`ALTER TABLE core.schema_migrations OWNER TO ${owner}`);
  await client.query(`ALTER TABLE core.schema_migration_journal OWNER TO ${owner}`);
  await client.query(`SET ROLE ${owner}`);
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

async function applyMigrationUp(client: MigrationClient, spec: MigrationSpec, prefix: string): Promise<void> {
  // The checksum stays the file's: the prefix is applied, never recorded.
  const sql = readFileSync(spec.upPath, 'utf8');
  await client.query('begin');
  try {
    await client.query(applyRolePrefix(sql, prefix));
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

async function applyMigrationDown(client: MigrationClient, spec: MigrationSpec, prefix: string): Promise<void> {
  if (!spec.downPath) {
    throw new Error(`Migration ${spec.id} is not rollbackable: missing .down.sql pair`);
  }
  const sql = readFileSync(spec.downPath, 'utf8');
  await client.query('begin');
  try {
    await client.query(applyRolePrefix(sql, prefix));
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
  connectionString: string | undefined,
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
  connectionString: string | undefined,
  dryRun = false,
  options?: MigrationOptions,
): Promise<string[]> {
  const prefix = rolePrefixOf(options);
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
      await promoteBootstrapObjectsToOwner(client, prefix);
    }
    for (const spec of pending) {
      await applyMigrationUp(client, spec, prefix);
      if (spec.id === '0002_extensions.sql') {
        await promoteBootstrapObjectsToOwner(client, prefix);
      }
    }
    return pending.map((spec) => spec.id);
  });
}

export async function migrateDown(
  rootDir: string,
  connectionString: string | undefined,
  steps = 1,
  dryRun = false,
  options?: MigrationOptions,
): Promise<string[]> {
  const prefix = rolePrefixOf(options);
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
      await applyMigrationDown(client, target, prefix);
    }
    return targets.map((target) => target.id);
  });
}

export async function migrateRedo(
  rootDir: string,
  connectionString: string | undefined,
  dryRun = false,
  options?: MigrationOptions,
): Promise<{ down: string[]; up: string[] }> {
  const down = await migrateDown(rootDir, connectionString, 1, dryRun, options);
  if (dryRun) {
    return { down, up: down };
  }
  const prefix = rolePrefixOf(options);
  const specs = new Map(listMigrationSpecs(rootDir, options).map((spec) => [spec.id, spec]));
  await withClient(connectionString, options, async (client) => {
    await ensureMigrationTables(client);
    for (const id of down) {
      const spec = specs.get(id);
      if (!spec) {
        throw new Error(`Migration ${id} is missing from the migration directory`);
      }
      await applyMigrationUp(client, spec, prefix);
    }
  });
  return { down, up: down };
}

export function listMigrations(rootDir: string, options?: MigrationOptions): MigrationSpec[] {
  return listMigrationSpecs(rootDir, options);
}
