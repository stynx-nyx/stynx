import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { StynxMigrationRunner } from '../../src/migration-runner';

// SM-06 (S-18): the runner applies the product role prefix to the immutable
// platform migrations at apply time and records the file's own checksum.
function makeRunner(migrations: Record<string, unknown>) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    calls.push({ sql, ...(values ? { values } : {}) });
    return { rows: [] };
  });
  const client = { query, release: vi.fn() };
  const pools = {
    onModuleInit: vi.fn(async () => undefined),
    pools: { owner: { connect: vi.fn(async () => client) }, app: {}, reader: {} },
  } as never;
  return { runner: new StynxMigrationRunner({ migrations } as never, pools), calls, pools };
}

async function rolesFile(): Promise<string> {
  return readFile(resolve(__dirname, '../../migrations/platform/0001_roles.sql'), 'utf8');
}

describe('StynxMigrationRunner role prefix', () => {
  it('applies the files unchanged and promotes to stynx_owner by default', async () => {
    const { runner, calls } = makeRunner({ enabled: false });
    await runner.runPlatformMigrations();
    const sql = await rolesFile();
    expect(calls.some((call) => call.sql === sql)).toBe(true);
    expect(calls.map((call) => call.sql)).toEqual(
      expect.arrayContaining([
        'ALTER SCHEMA core OWNER TO stynx_owner',
        'ALTER TABLE core.schema_migrations OWNER TO stynx_owner',
        'SET ROLE stynx_owner',
      ]),
    );
  });

  it('applies prefix demo to role identifiers and records the file checksum input', async () => {
    const { runner, calls } = makeRunner({ enabled: false, rolePrefix: 'demo' });
    await runner.runPlatformMigrations();
    const sql = await rolesFile();
    const executed = calls.map((call) => call.sql);
    expect(executed).not.toContain(sql);
    expect(executed.some((text) => text.includes('CREATE ROLE demo_owner LOGIN NOINHERIT BYPASSRLS;'))).toBe(true);
    expect(executed.filter((text) => /\bstynx_(owner|app|reader)\b/u.test(text))).toEqual([]);
    expect(executed).toEqual(
      expect.arrayContaining([
        'ALTER SCHEMA core OWNER TO demo_owner',
        'ALTER TABLE core.schema_migrations OWNER TO demo_owner',
        'SET ROLE demo_owner',
      ]),
    );
    const ledger = calls.find(
      (call) => call.sql.includes('insert into core.schema_migrations') && call.values?.[0] === '0001_roles.sql',
    );
    expect(ledger?.values).toEqual(['0001_roles.sql', sql]);
  });

  it('refuses an invalid prefix before connecting', async () => {
    const { runner, pools } = makeRunner({ enabled: false, rolePrefix: 'Demo;' });
    await expect(runner.runPlatformMigrations()).rejects.toThrow('Invalid role prefix');
    expect((pools as unknown as { onModuleInit: ReturnType<typeof vi.fn> }).onModuleInit).not.toHaveBeenCalled();
  });
});
