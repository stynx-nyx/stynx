import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
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

  async connect(): Promise<void> {
    this.connected = true;
  }

  async end(): Promise<void> {
    this.connected = false;
  }

  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[]; rowCount?: number | null }> {
    this.executedSql.push(sql.trim());

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
});
