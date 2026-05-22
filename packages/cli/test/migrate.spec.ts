import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const mockPg = vi.hoisted(() => ({
  clients: [] as unknown[],
  Client: vi.fn((options: { connectionString: string }) => {
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
} from '../src/migrate';

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
});
