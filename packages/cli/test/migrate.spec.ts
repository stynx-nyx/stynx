import { QueryRowValidationError } from '@stynx-nyx/data';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const mockPg = vi.hoisted(() => ({
  clients: [] as unknown[],
  // `pg.Client` is constructed with `new`; Vitest 4 rejects arrow-function
  // mock implementations as constructors, so the mock uses a `function` body.
  Client: vi.fn(function (options: { connectionString: string }) {
    const client = mockPg.clients.shift() as { connectionString?: string } | undefined;
    if (!client) {
      throw new Error('Missing mocked pg client');
    }
    client.connectionString = options.connectionString;
    return client;
  }),
}));

vi.mock('pg', () => ({ Client: mockPg.Client }));

import {
  listMigrations,
  migrateDown,
  migrateRedo,
  migrateUp,
  migrationStatus,
  type MigrationClient,
  type MigrationClientFactoryOptions,
} from '../src/migrate.js';

class FakeMigrationClient implements MigrationClient {
  readonly applied = new Map<string, string>();
  readonly journal: Array<{ id: string; direction: string }> = [];
  readonly executedSql: string[] = [];
  connected = false;
  connectionString?: string;
  failOnSql: RegExp | null = null;
  onQuery: ((sql: string, values: unknown[]) => void) | null = null;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async end(): Promise<void> {
    this.connected = false;
  }

  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[]; rowCount?: number | null }> {
    this.executedSql.push(sql.trim());
    if (this.failOnSql?.test(sql)) {
      throw new Error('query failed');
    }
    this.onQuery?.(sql, values);

    if (/select id from core\.schema_migrations order by id/u.test(sql)) {
      return { rows: [...this.applied.keys()].sort().map((id) => ({ id })) };
    }
    if (/from core\.schema_migrations\s+order by applied_at desc, id desc/u.test(sql)) {
      const limit = Number(values[0] ?? 0);
      return {
        rows: [...this.applied.keys()]
          .slice()
          .reverse()
          .slice(0, limit)
          .map((id) => ({ id })),
      };
    }
    if (/from core\.schema_migration_journal/u.test(sql)) {
      const limit = Number(values[0] ?? 0);
      return {
        rows: [...this.journal]
          .filter((row) => row.direction === 'up')
          .slice()
          .reverse()
          .slice(0, limit)
          .map((row) => ({ id: row.id })),
      };
    }
    if (/insert into core\.schema_migrations/u.test(sql)) {
      this.applied.set(String(values[0]), String(values[1]));
      return { rows: [], rowCount: 1 };
    }
    if (/delete from core\.schema_migrations/u.test(sql)) {
      this.applied.delete(String(values[0]));
      return { rows: [], rowCount: 1 };
    }
    if (/insert into core\.schema_migration_journal/u.test(sql)) {
      this.journal.push({ id: String(values[0]), direction: String(values[2]) });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  }
}

function clientFactoryFor(fake: FakeMigrationClient) {
  return (_options: MigrationClientFactoryOptions) => fake;
}

describe('migrate command surface', () => {
  function createFixtureDir(): string {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-'));
    const dir = resolve(root, 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0001_first.sql'), 'select 1;', 'utf8');
    writeFileSync(resolve(dir, '0001_first.down.sql'), 'select 11;', 'utf8');
    writeFileSync(resolve(dir, '0002_second.sql'), 'select 2;', 'utf8');
    writeFileSync(resolve(dir, '0002_second.down.sql'), 'select 22;', 'utf8');
    return dir;
  }

  it.each([{}, { id: 17 }, { id: null }])(
    'rejects malformed applied migration IDs before applying any migration: %j', async (row) => {
      const migrationDir = createFixtureDir();
      const fake = new FakeMigrationClient();
      const original = fake.query.bind(fake);
      vi.spyOn(fake, 'query').mockImplementation(async (sql, values) => {
        if (/select id from core\.schema_migrations order by id/u.test(sql)) return { rows: [row] };
        return original(sql, values);
      });
      try {
        await expect(migrateUp(process.cwd(), 'postgresql://example', false, {
          migrationDir, clientFactory: clientFactoryFor(fake),
        })).rejects.toBeInstanceOf(QueryRowValidationError);
        expect(fake.applied.size).toBe(0);
        expect(fake.journal).toEqual([]);
        expect(fake.executedSql).not.toContain('select 1;');
        expect(fake.executedSql).not.toContain('select 2;');
        expect(fake.connected).toBe(false);
      } finally {
        rmSync(resolve(migrationDir, '..'), { recursive: true, force: true });
      }
    });

  it('reports pending/applied/rollbackable migrations', async () => {
    const migrationDir = createFixtureDir();
    const fake = new FakeMigrationClient();
    const status = await migrationStatus(process.cwd(), 'postgresql://example', {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    });
    expect(status.pending).toEqual(['0001_first.sql', '0002_second.sql']);
    expect(status.applied).toEqual([]);
    expect(status.rollbackable).toEqual([]);
    expect(fake.connected).toBe(false);
    expect(fake.executedSql[0]).toBe('create schema if not exists core');
    expect(fake.executedSql[1]).toContain('create table if not exists core.schema_migrations');
    expect(fake.executedSql[2]).toContain('create table if not exists core.schema_migration_journal');
  });

  it('uses the default pg client factory when no factory override is supplied', async () => {
    const migrationDir = createFixtureDir();
    const fake = new FakeMigrationClient();
    mockPg.clients.push(fake);

    await expect(migrationStatus(process.cwd(), 'postgresql://default-client', { migrationDir })).resolves.toEqual({
      applied: [],
      pending: ['0001_first.sql', '0002_second.sql'],
      rollbackable: [],
    });

    expect(mockPg.Client).toHaveBeenCalledWith({ connectionString: 'postgresql://default-client' });
    expect(fake.connectionString).toBe('postgresql://default-client');
  });

  it('gives the pg client no connectionString when no database URL is given (SM-06)', async () => {
    const migrationDir = createFixtureDir();
    const fake = new FakeMigrationClient();
    mockPg.clients.push(fake);

    await expect(migrationStatus(process.cwd(), undefined, { migrationDir })).resolves.toEqual({
      applied: [],
      pending: ['0001_first.sql', '0002_second.sql'],
      rollbackable: [],
    });
    // node-postgres then reads PGHOST, PGPORT, PGUSER, PGPASSWORD and PGDATABASE.
    expect(mockPg.Client).toHaveBeenLastCalledWith({});

    const factoryOptions: MigrationClientFactoryOptions[] = [];
    const factory = (options: MigrationClientFactoryOptions) => {
      factoryOptions.push(options);
      return new FakeMigrationClient();
    };
    await migrationStatus(process.cwd(), undefined, { migrationDir, clientFactory: factory });
    await migrateUp(process.cwd(), undefined, false, { migrationDir, clientFactory: factory });
    await migrateDown(process.cwd(), undefined, 1, true, { migrationDir, clientFactory: factory });
    await migrateRedo(process.cwd(), undefined, true, { migrationDir, clientFactory: factory });
    expect(factoryOptions.length).toBeGreaterThanOrEqual(4);
    expect(factoryOptions.every((options) => !('connectionString' in options))).toBe(true);
  });

  it('applies, rolls back, and redoes paired migrations', async () => {
    const migrationDir = createFixtureDir();
    const fake = new FakeMigrationClient();

    await expect(migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual(['0001_first.sql', '0002_second.sql']);

    await expect(migrationStatus(process.cwd(), 'postgresql://example', {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual({
      applied: ['0001_first.sql', '0002_second.sql'],
      pending: [],
      rollbackable: ['0001_first.sql', '0002_second.sql'],
    });

    await expect(migrateDown(process.cwd(), 'postgresql://example', 1, false, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual(['0002_second.sql']);

    await expect(migrateRedo(process.cwd(), 'postgresql://example', false, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual({
      down: ['0001_first.sql'],
      up: ['0001_first.sql'],
    });
  });

  it('lists migrations and supports dry-run up/down/redo without applying changes', async () => {
    const migrationDir = createFixtureDir();
    const fake = new FakeMigrationClient();
    fake.applied.set('0001_first.sql', 'checksum-1');

    expect(listMigrations(process.cwd(), { migrationDir }).map((spec) => spec.id)).toEqual([
      '0001_first.sql',
      '0002_second.sql',
    ]);
    await expect(migrateUp(process.cwd(), 'postgresql://example', true, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual(['0002_second.sql']);
    await expect(migrateDown(process.cwd(), 'postgresql://example', 1, true, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual(['0001_first.sql']);
    await expect(migrateRedo(process.cwd(), 'postgresql://example', true, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual({
      down: ['0001_first.sql'],
      up: ['0001_first.sql'],
    });
    expect(fake.journal).toEqual([]);
  });

  it('filters migration specs to forward sql files and records deterministic checksums', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-filter-'));
    const dir = resolve(root, 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0002_second.sql'), 'select 2;', 'utf8');
    writeFileSync(resolve(dir, '0002_second.down.sql'), 'select 22;', 'utf8');
    writeFileSync(resolve(dir, '0001_first.sql'), 'select 1;', 'utf8');
    writeFileSync(resolve(dir, '0001_first.down.sql'), 'select 11;', 'utf8');
    writeFileSync(resolve(dir, '0003_notes.txt'), 'ignored', 'utf8');
    writeFileSync(resolve(dir, '0004_almost.sql.bak'), 'ignored', 'utf8');
    const fake = new FakeMigrationClient();

    expect(listMigrations(process.cwd(), { migrationDir: dir })).toEqual([
      {
        id: '0001_first.sql',
        upPath: resolve(dir, '0001_first.sql'),
        downPath: resolve(dir, '0001_first.down.sql'),
      },
      {
        id: '0002_second.sql',
        upPath: resolve(dir, '0002_second.sql'),
        downPath: resolve(dir, '0002_second.down.sql'),
      },
    ]);

    await expect(migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir: dir,
      clientFactory: clientFactoryFor(fake),
    })).resolves.toEqual(['0001_first.sql', '0002_second.sql']);
    expect(fake.applied.get('0001_first.sql')).toBe(
      `9:${Buffer.from('select 1;', 'utf8').toString('base64url').slice(0, 24)}`,
    );
    expect(fake.applied.get('0002_second.sql')).toBe(
      `9:${Buffer.from('select 2;', 'utf8').toString('base64url').slice(0, 24)}`,
    );
  });

  it('uses the default platform migration directory when none is supplied', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-default-dir-'));
    const dir = resolve(root, 'packages/data/migrations/platform');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0001_platform.sql'), 'select 1;', 'utf8');
    writeFileSync(resolve(dir, '0001_platform.down.sql'), 'select 11;', 'utf8');

    expect(listMigrations(root)).toEqual([{
      id: '0001_platform.sql',
      upPath: resolve(dir, '0001_platform.sql'),
      downPath: resolve(dir, '0001_platform.down.sql'),
    }]);
  });

  it('derives a down path by replacing only the final sql suffix', () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-repeat-suffix-'));
    const dir = resolve(root, 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0001_repeat.sql.sql'), 'select 1;', 'utf8');
    writeFileSync(resolve(dir, '0001_repeat.sql.down.sql'), 'select 11;', 'utf8');

    expect(listMigrations(process.cwd(), { migrationDir: dir })).toEqual([{
      id: '0001_repeat.sql.sql',
      upPath: resolve(dir, '0001_repeat.sql.sql'),
      downPath: resolve(dir, '0001_repeat.sql.down.sql'),
    }]);
  });

  it('rejects rollback of migrations without a down pair', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-nodown-'));
    const dir = resolve(root, 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0001_missing_down.sql'), 'select 1;', 'utf8');
    const fake = new FakeMigrationClient();
    fake.applied.set('0001_missing_down.sql', 'checksum-1');

    await expect(migrateDown(process.cwd(), 'postgresql://example', 1, false, {
      migrationDir: dir,
      clientFactory: clientFactoryFor(fake),
    })).rejects.toThrow('not rollbackable');
  });

  it('keeps dry-run rollback validation for migrations without a down pair', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-nodown-dry-'));
    const dir = resolve(root, 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0001_missing_down.sql'), 'select 1;', 'utf8');
    const fake = new FakeMigrationClient();
    fake.applied.set('0001_missing_down.sql', 'checksum-1');

    await expect(migrateDown(process.cwd(), 'postgresql://example', 1, true, {
      migrationDir: dir,
      clientFactory: clientFactoryFor(fake),
    })).rejects.toThrow('not rollbackable');
  });

  it('fails redo when a migration file disappears between rollback and replay', async () => {
    const migrationDir = createFixtureDir();
    const missingPath = resolve(migrationDir, '0001_first.sql');
    const fake = new FakeMigrationClient();
    fake.applied.set('0001_first.sql', 'checksum-1');
    fake.onQuery = (sql) => {
      if (/delete from core\.schema_migrations/u.test(sql)) {
        rmSync(missingPath, { force: true });
      }
    };

    await expect(migrateRedo(process.cwd(), 'postgresql://example', false, {
      migrationDir,
      clientFactory: clientFactoryFor(fake),
    })).rejects.toThrow('missing from the migration directory');
  });

  it('rolls back SQL transactions when migration up or down execution fails', async () => {
    const migrationDir = createFixtureDir();
    const upFailure = new FakeMigrationClient();
    upFailure.failOnSql = /select 1;/u;
    await expect(migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir,
      clientFactory: clientFactoryFor(upFailure),
    })).rejects.toThrow('query failed');
    expect(upFailure.executedSql).toContain('rollback');

    const downFailure = new FakeMigrationClient();
    downFailure.applied.set('0001_first.sql', 'checksum-1');
    downFailure.failOnSql = /select 11;/u;
    await expect(migrateDown(process.cwd(), 'postgresql://example', 1, false, {
      migrationDir,
      clientFactory: clientFactoryFor(downFailure),
    })).rejects.toThrow('query failed');
    expect(downFailure.executedSql).toContain('rollback');
  });

  it('promotes bootstrap objects when the extension migration is already applied or just applied', async () => {
    const root = mkdtempSync(resolve(tmpdir(), 'stynx-cli-migrate-promote-'));
    const dir = resolve(root, 'migrations');
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, '0002_extensions.sql'), 'select 2;', 'utf8');
    writeFileSync(resolve(dir, '0002_extensions.down.sql'), 'select 22;', 'utf8');
    writeFileSync(resolve(dir, '0003_next.sql'), 'select 3;', 'utf8');
    writeFileSync(resolve(dir, '0003_next.down.sql'), 'select 33;', 'utf8');

    const alreadyApplied = new FakeMigrationClient();
    alreadyApplied.applied.set('0002_extensions.sql', 'checksum-2');
    await expect(migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir: dir,
      clientFactory: clientFactoryFor(alreadyApplied),
    })).resolves.toEqual(['0003_next.sql']);
    expect(alreadyApplied.executedSql).toEqual(expect.arrayContaining([
      'ALTER SCHEMA core OWNER TO stynx_owner',
      'ALTER TABLE core.schema_migrations OWNER TO stynx_owner',
      'ALTER TABLE core.schema_migration_journal OWNER TO stynx_owner',
      'SET ROLE stynx_owner',
    ]));

    const justApplied = new FakeMigrationClient();
    await expect(migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir: dir,
      clientFactory: clientFactoryFor(justApplied),
    })).resolves.toEqual(['0002_extensions.sql', '0003_next.sql']);
    expect(justApplied.executedSql).toEqual(expect.arrayContaining([
      'ALTER SCHEMA core OWNER TO stynx_owner',
      'SET ROLE stynx_owner',
    ]));
  });

  it.each(['success', 'connect', 'query', 'end'])('preserves native client receiver and rejection identity: %s', async (phase) => {
    const migrationDir = createFixtureDir();
    const failure = new Error('native client rejection');
    const calls: string[] = [];
    const client = {
      async connect() {
        expect(this).toBe(client); calls.push('connect');
        if (phase === 'connect') throw failure;
        return this;
      },
      async query(_sql: string, _values?: unknown[]) {
        expect(this).toBe(client); calls.push('query');
        if (phase === 'query') throw failure;
        return { rows: [] };
      },
      async end() {
        expect(this).toBe(client); calls.push('end');
        if (phase === 'end') throw failure;
      },
    };
    mockPg.clients.push(client);
    try {
      const result = migrationStatus(process.cwd(), undefined, { migrationDir });
      if (phase === 'success') await expect(result).resolves.toBeDefined();
      else await expect(result).rejects.toBe(failure);
      expect(calls[0]).toBe('connect');
      if (phase === 'connect') expect(calls).toEqual(['connect']);
      else { expect(calls).toContain('query'); expect(calls.at(-1)).toBe('end'); }
    } finally { rmSync(resolve(migrationDir, '..'), { recursive: true, force: true }); }
  });


  describe('migrate actual default/custom finally precedence', () => {
  it.each(['native-default', 'custom'])('preserves end rejection overriding query failure for %s', async (mode) => {
    const migrationDir = createFixtureDir();
    const client = new FakeMigrationClient(); const queryError = new Error('query failed first'); const endError = new Error('end failed last');
    const calls: string[] = [];
    vi.spyOn(client, 'connect').mockImplementation(async function () { expect(this).toBe(client); calls.push('connect'); });
    vi.spyOn(client, 'query').mockImplementation(async function () { expect(this).toBe(client); calls.push('query'); throw queryError; });
    vi.spyOn(client, 'end').mockImplementation(async function () { expect(this).toBe(client); calls.push('end'); throw endError; });
    const clientFactory = mode === 'custom' ? () => client : undefined;
    if (mode === 'native-default') mockPg.clients.push(client);
    try { await expect(migrationStatus(process.cwd(), undefined, { migrationDir, clientFactory })).rejects.toBe(endError); expect(calls).toEqual(['connect', 'query', 'end']); }
    finally { rmSync(resolve(migrationDir, '..'), { recursive: true, force: true }); }
  });

  it('does not query or end when a custom connect rejects', async () => {
    const migrationDir = createFixtureDir();
    const client = new FakeMigrationClient(); const failure = new Error('custom connect failure');
    const connect = vi.spyOn(client, 'connect').mockRejectedValueOnce(failure); const query = vi.spyOn(client, 'query'); const end = vi.spyOn(client, 'end');
    const clientFactory = () => client;
    try { await expect(migrationStatus(process.cwd(), undefined, { migrationDir, clientFactory })).rejects.toBe(failure); expect(connect).toHaveBeenCalledTimes(1); expect(query).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled(); }
    finally { rmSync(resolve(migrationDir, '..'), { recursive: true, force: true }); }
  });
});

});
