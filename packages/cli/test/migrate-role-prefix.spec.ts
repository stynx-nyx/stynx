import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { migrateDown, migrateRedo, migrateUp, type MigrationClient } from '../src/migrate.js';

// SM-06 (S-18): `stynx migrate --role-prefix <product>` applies the immutable
// platform migrations as <product>_{owner,app,reader}; the default is stynx.
const ROLES_SQL = [
  `CREATE ROLE stynx_owner LOGIN NOINHERIT BYPASSRLS;`,
  `GRANT CONNECT ON DATABASE x TO stynx_app, stynx_reader;`,
  `select current_setting('stynx.audit_chain_key', true); -- stynx:archive`,
].join('\n');

class RecordingClient implements MigrationClient {
  readonly sql: string[] = [];
  readonly ledger: unknown[][] = [];
  readonly applied: string[] = [];
  async connect(): Promise<void> {}
  async end(): Promise<void> {}
  async query(sql: string, values: unknown[] = []): Promise<{ rows: unknown[] }> {
    this.sql.push(sql.trim());
    if (/select id from core\.schema_migrations order by id/u.test(sql)) {
      return { rows: this.applied.map((id) => ({ id })) };
    }
    if (/order by applied_at desc/u.test(sql)) {
      return { rows: [...this.applied].reverse().map((id) => ({ id })) };
    }
    if (/insert into core\.schema_migrations/u.test(sql)) {
      this.ledger.push(values);
    }
    return { rows: [] };
  }
}

function fixture(): string {
  const dir = resolve(mkdtempSync(resolve(tmpdir(), 'stynx-cli-role-prefix-')), 'migrations');
  mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, '0001_roles.sql'), ROLES_SQL, 'utf8');
  writeFileSync(resolve(dir, '0001_roles.down.sql'), 'DROP OWNED BY stynx_app;', 'utf8');
  writeFileSync(resolve(dir, '0002_extensions.sql'), 'select 2;', 'utf8');
  return dir;
}

describe('migrate role prefix', () => {
  it('applies the files byte for byte and promotes to stynx_owner by default', async () => {
    const client = new RecordingClient();
    await migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir: fixture(),
      clientFactory: () => client,
    });
    expect(client.sql).toContain(ROLES_SQL);
    expect(client.sql).toEqual(
      expect.arrayContaining([
        'ALTER SCHEMA core OWNER TO stynx_owner',
        'ALTER TABLE core.schema_migrations OWNER TO stynx_owner',
        'ALTER TABLE core.schema_migration_journal OWNER TO stynx_owner',
        'SET ROLE stynx_owner',
      ]),
    );
  });

  it('rewrites only role identifiers for prefix demo and keeps the file checksum', async () => {
    const dir = fixture();
    const client = new RecordingClient();
    await migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir: dir,
      rolePrefix: 'demo',
      clientFactory: () => client,
    });
    expect(client.sql).toContain(
      [
        `CREATE ROLE demo_owner LOGIN NOINHERIT BYPASSRLS;`,
        `GRANT CONNECT ON DATABASE x TO demo_app, demo_reader;`,
        `select current_setting('stynx.audit_chain_key', true); -- stynx:archive`,
      ].join('\n'),
    );
    expect(client.sql.filter((sql) => /\bstynx_(owner|app|reader)\b/u.test(sql))).toEqual([]);
    expect(client.sql).toEqual(
      expect.arrayContaining([
        'ALTER SCHEMA core OWNER TO demo_owner',
        'ALTER TABLE core.schema_migration_journal OWNER TO demo_owner',
        'SET ROLE demo_owner',
      ]),
    );

    const defaultClient = new RecordingClient();
    await migrateUp(process.cwd(), 'postgresql://example', false, {
      migrationDir: dir,
      clientFactory: () => defaultClient,
    });
    expect(client.ledger).toEqual(defaultClient.ledger);
  });

  it('applies the prefix to rollbacks and redo', async () => {
    const dir = fixture();
    const down = new RecordingClient();
    down.applied.push('0001_roles.sql');
    await expect(
      migrateDown(process.cwd(), 'postgresql://example', 1, false, {
        migrationDir: dir,
        rolePrefix: 'demo',
        clientFactory: () => down,
      }),
    ).resolves.toEqual(['0001_roles.sql']);
    expect(down.sql).toContain('DROP OWNED BY demo_app;');

    const redo = new RecordingClient();
    redo.applied.push('0001_roles.sql');
    await migrateRedo(process.cwd(), 'postgresql://example', false, {
      migrationDir: dir,
      rolePrefix: 'demo',
      clientFactory: () => redo,
    });
    expect(redo.sql).toContain('DROP OWNED BY demo_app;');
    expect(redo.sql.some((sql) => sql.startsWith('CREATE ROLE demo_owner'))).toBe(true);
  });

  it('refuses prefixes that are not lower-case unquoted identifiers', async () => {
    for (const rolePrefix of ['', 'Demo', 'demo;drop', 'a'.repeat(57)]) {
      const client = new RecordingClient();
      const options = { migrationDir: fixture(), rolePrefix, clientFactory: () => client };
      await expect(migrateUp(process.cwd(), 'postgresql://example', false, options)).rejects.toThrow(
        'Invalid role prefix',
      );
      await expect(migrateDown(process.cwd(), 'postgresql://example', 1, false, options)).rejects.toThrow(
        'Invalid role prefix',
      );
      expect(client.sql).toEqual([]);
    }
    const client = new RecordingClient();
    await expect(
      migrateUp(process.cwd(), 'postgresql://example', true, {
        migrationDir: fixture(),
        rolePrefix: 'a'.repeat(56),
        clientFactory: () => client,
      }),
    ).resolves.toEqual(['0001_roles.sql', '0002_extensions.sql']);
  });
});
