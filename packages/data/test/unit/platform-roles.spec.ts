import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  applyRolePrefix,
  assertRolePrefix,
  DEFAULT_ROLE_PREFIX,
  platformRoleNames,
  ROLE_PREFIX_MAX_LENGTH,
} from '../../src/platform-roles.js';

// SM-06 (S-18): the platform migration files are immutable and name the
// stynx_* roles; the runner rewrites only those role identifiers.
const migrationDir = resolve(__dirname, '../../migrations/platform');
const ROLE = /\b(stynx|demo)_(owner|app|reader)\b/gu;

async function platformMigrations(): Promise<Array<{ file: string; sql: string }>> {
  const files = (await readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (file) => ({ file, sql: await readFile(resolve(migrationDir, file), 'utf8') })),
  );
}

describe('platform role prefix', () => {
  it('defaults to the stynx roles', () => {
    expect(DEFAULT_ROLE_PREFIX).toBe('stynx');
    expect(platformRoleNames()).toEqual({
      owner: 'stynx_owner',
      app: 'stynx_app',
      reader: 'stynx_reader',
    });
    expect(platformRoleNames('demo')).toEqual({
      owner: 'demo_owner',
      app: 'demo_app',
      reader: 'demo_reader',
    });
  });

  it('applies every platform migration byte for byte under the default prefix', async () => {
    const migrations = await platformMigrations();
    expect(migrations.length).toBeGreaterThan(0);
    for (const { sql } of migrations) {
      expect(applyRolePrefix(sql)).toBe(sql);
      expect(applyRolePrefix(sql, 'stynx')).toBe(sql);
    }
  });

  it('rewrites only role identifiers under prefix demo', async () => {
    for (const { file, sql } of await platformMigrations()) {
      const demo = applyRolePrefix(sql, 'demo');
      expect({ file, left: demo.match(/\bstynx_(owner|app|reader)\b/gu) }).toEqual({ file, left: null });
      // Masking the role identifiers of both texts leaves identical bytes:
      // schema names, GUCs and other stynx text are untouched.
      expect(demo.replace(ROLE, '<role:$2>')).toBe(sql.replace(ROLE, '<role:$2>'));
      expect(demo.match(/\bdemo_(owner|app|reader)\b/gu)?.length ?? 0).toBe(
        sql.match(/\bstynx_(owner|app|reader)\b/gu)?.length ?? 0,
      );
    }
    const roles = (await readFile(resolve(migrationDir, '0001_roles.sql'), 'utf8'));
    expect(applyRolePrefix(roles, 'demo')).toContain('CREATE ROLE demo_app LOGIN NOINHERIT NOBYPASSRLS;');
    expect(applyRolePrefix(roles, 'demo')).toContain("WHERE rolname = 'demo_owner'");
  });

  it('leaves non-role stynx text alone', () => {
    const sql = [
      `select current_setting('stynx.audit_chain_key', true);`,
      `comment on table archive.x is 'stynx:archive-source=demo.x';`,
      `grant usage on schema stynx_ext to stynx_app;`,
      `create role stynx_application; grant stynx_reader to "stynx_owner";`,
    ].join('\n');
    expect(applyRolePrefix(sql, 'acme')).toBe(
      [
        `select current_setting('stynx.audit_chain_key', true);`,
        `comment on table archive.x is 'stynx:archive-source=demo.x';`,
        `grant usage on schema stynx_ext to acme_app;`,
        `create role stynx_application; grant acme_reader to "acme_owner";`,
      ].join('\n'),
    );
  });

  it('refuses prefixes that are not lower-case unquoted identifiers', () => {
    expect(ROLE_PREFIX_MAX_LENGTH).toBe(56);
    expect(assertRolePrefix('demo')).toBe('demo');
    expect(assertRolePrefix('a'.repeat(56))).toBe('a'.repeat(56));
    for (const prefix of ['', 'Demo', '1demo', 'de-mo', 'demo;drop', 'a'.repeat(57), 'demo"x']) {
      expect(() => assertRolePrefix(prefix)).toThrow(TypeError);
      expect(() => applyRolePrefix('select 1', prefix)).toThrow('Invalid role prefix');
      expect(() => platformRoleNames(prefix)).toThrow('Invalid role prefix');
    }
    expect(() => assertRolePrefix(42 as unknown as string)).toThrow(TypeError);
  });
});
