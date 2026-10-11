import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { lintSqlTarget } from '../src/lint.js';

const execFileAsync = promisify(execFile);
const currentFile = fileURLToPath(import.meta.url);
const currentDir = dirname(currentFile);
const packageRoot = resolve(currentDir, '..', '..');
const repoRoot = resolve(packageRoot, '..', '..');
const fixturesDir = join(packageRoot, 'test', 'fixtures');
const cliPath = join(packageRoot, 'dist', 'src', 'cli.js');

const ruleCases = [
  ['LINT001', 'lint001-pass.sql', [], 0],
  ['LINT001', 'lint001-fail.sql', ['LINT001'], 1],
  ['LINT002', 'lint002-pass.sql', [], 0],
  ['LINT002', 'lint002-fail.sql', ['LINT002'], 1],
  ['LINT003', 'lint003-pass.sql', [], 0],
  ['LINT003', 'lint003-fail.sql', ['LINT003'], 1],
  ['LINT004', 'lint004-pass.sql', [], 0],
  ['LINT004', 'lint004-fail.sql', ['LINT004'], 1],
  ['LINT005', 'lint005-pass.sql', [], 0],
  ['LINT005', 'lint005-fail.sql', ['LINT005'], 1],
  ['LINT006', 'lint006-pass.sql', [], 0],
  ['LINT006', 'lint006-fail.sql', ['LINT006'], 1],
  ['LINT007', 'lint007-pass.sql', [], 0],
  ['LINT007', 'lint007-fail.sql', ['LINT007'], 1],
  ['LINT008', 'lint008-pass.sql', [], 0],
  ['LINT008', 'lint008-fail.sql', ['LINT008'], 1],
  ['LINT009', 'lint009-pass.sql', [], 0],
  ['LINT009', 'lint009-fail.sql', ['LINT009'], 1],
] as const;

for (const [ruleCode, fileName, expectedCodes] of ruleCases) {
  test(`${ruleCode} fixture ${fileName}`, async () => {
    const result = await lintSqlTarget(join(fixturesDir, fileName));
    const actualCodes = result.issues.map((issue) => issue.code);
    assert.deepEqual(actualCodes, expectedCodes);
    assert.equal(result.parserIssues.length, 0);
  });
}

test('reference migration is clean', async () => {
  // Path updated post C-4 Phase G/T6 (specs/ retired, see docs/adopters/pilots/c-4/phase-i-retro.md §10).
  // Canonical reference migration now lives under reference/api/migrations/.
  const result = await lintSqlTarget(
    join(repoRoot, 'reference', 'api', 'migrations', '0001_reference.sql'),
  );
  assert.equal(result.parserIssues.length, 0);
  assert.deepEqual(result.issues, []);
});

test('cli returns parser exit code 2 on invalid SQL', async () => {
  const invalidFixture = join(fixturesDir, 'parser-error.sql');
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [cliPath, invalidFixture, '--format=json'],
    {
      cwd: repoRoot,
    },
  ).then(
    (value) => value,
    (error: NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string }) => {
      assert.equal(error.code, 2);
      return {
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
      };
    },
  );

  const output = JSON.parse(stdout || stderr);
  assert.equal(output.parserIssues.length, 1);
  assert.equal(output.issues.length, 0);
});

test('cli emits fix suggestions when requested', async () => {
  const fixture = join(fixturesDir, 'lint002-fail.sql');
  const output = readFileSync(fixture, 'utf8');
  assert.match(output, /CREATE TABLE acme\.customer/);

  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, fixture, '--format=json', '--fix-suggestions'],
    {
      cwd: repoRoot,
    },
  ).then(
    (value) => value,
    (error: NodeJS.ErrnoException & { code?: number; stdout?: string }) => {
      assert.equal(error.code, 1);
      return {
        stdout: error.stdout ?? '',
      };
    },
  );

  const parsed = JSON.parse(stdout);
  assert.equal(parsed.issues[0].code, 'LINT002');
  assert.match(parsed.issues[0].suggestion, /data\.create_soft_deletable_table/);
});

test('repo migrations lint without parser errors', async () => {
  const result = await lintSqlTarget(join(repoRoot, 'packages', 'data', 'migrations'));
  assert.equal(result.parserIssues.length, 0, JSON.stringify(result.parserIssues, null, 2));
});

// INV-CORE-001; LINT005 remains fail-closed outside actual catalog privilege data.
const inquiryCases = [
  [
    'direct qualified catalog inquiry',
    "SELECT pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    false,
  ],
  [
    'full maintenance privilege list',
    "SELECT pg_catalog.has_table_privilege('app', 'demo.bookmark', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER' || ', MAINTAIN');",
    false,
  ],
  [
    'grant option inquiry',
    "SELECT pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE WITH GRANT OPTION');",
    false,
  ],
  [
    'case and whitespace inquiry',
    "SELECT PG_CATALOG . HAS_TABLE_PRIVILEGE(current_user, 'demo.bookmark', 'select , truncate');",
    false,
  ],
  [
    'real DO block inquiry',
    "DO $body$ BEGIN IF pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE') THEN RAISE EXCEPTION 'excess privilege'; END IF; END $body$;",
    false,
  ],
  [
    'nested comment before real DO body',
    "DO /* outer /* nested */ still outer */ $body$ BEGIN PERFORM pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE'); END $body$;",
    false,
  ],
  [
    'nested function argument inquiry',
    "SELECT pg_catalog.has_table_privilege(coalesce(current_user, 'app'), 'demo.bookmark', 'TRUNCATE');",
    false,
  ],
  [
    'inquiry followed by real truncate',
    "SELECT pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE'); TRUNCATE demo.bookmark;",
    true,
  ],
  [
    'inquiry followed by real drop',
    "SELECT pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE'); DROP TABLE demo.bookmark;",
    true,
  ],
  [
    'inquiry followed by real drop column',
    "SELECT pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE'); ALTER TABLE demo.bookmark DROP COLUMN title;",
    true,
  ],
  [
    'dynamic truncate in real DO',
    "DO $$ BEGIN EXECUTE 'TRUNCATE demo.bookmark'; PERFORM pg_catalog.has_table_privilege(current_user, 'demo.bookmark', 'TRUNCATE'); END $$;",
    true,
  ],
  [
    'dynamic drop containing fake catalog text',
    "DO $$ BEGIN EXECUTE 'DROP TABLE demo.bookmark; SELECT pg_catalog.has_table_privilege(''app'',''demo.bookmark'',''TRUNCATE'')'; END $$;",
    true,
  ],
  [
    'dollar quoted dynamic SQL stays visible',
    "DO $$ BEGIN EXECUTE $sql$TRUNCATE demo.bookmark; SELECT pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE')$sql$; END $$;",
    true,
  ],
  [
    'ordinary dollar string stays conservative',
    "SELECT $sql$pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE')$sql$;",
    true,
  ],
  [
    'quoted SQL text stays conservative',
    "SELECT 'pg_catalog.has_table_privilege(''app'',''demo.bookmark'',''TRUNCATE'')';",
    true,
  ],
  [
    'escaped SQL text stays conservative',
    String.raw`SELECT E'pg_catalog.has_table_privilege(\'app\',\'demo.bookmark\',\'TRUNCATE\')';`,
    true,
  ],
  [
    'unqualified function is not admitted',
    "SELECT has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'foreign schema is not admitted',
    "SELECT evil.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'unicode schema prefix is not admitted',
    "SELECT épg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'three-part qualification is not admitted',
    "SELECT evil. pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'quoted qualified function remains conservative',
    `SELECT "pg_catalog"."has_table_privilege"('app','demo.bookmark','TRUNCATE');`,
    true,
  ],
  [
    'wrong arity remains conservative',
    "SELECT pg_catalog.has_table_privilege('demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'extra argument remains conservative',
    "SELECT pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE', true);",
    true,
  ],
  [
    'invalid privilege list remains conservative',
    "SELECT pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE, INVENTED');",
    true,
  ],
  [
    'destructive SQL in third argument remains visible',
    "SELECT pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE demo.bookmark');",
    true,
  ],
  [
    'destructive SQL in first argument remains visible',
    "SELECT pg_catalog.has_table_privilege('TRUNCATE demo.bookmark', 'demo.bookmark', 'SELECT');",
    true,
  ],
  [
    'destructive concatenation after admitted data remains visible',
    "SELECT pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE' || ' DROP TABLE demo.bookmark');",
    true,
  ],
  ['comment-separated drop is destructive', 'DROP/**/TABLE demo.bookmark;', true],
  [
    'nested-comment-separated drop is destructive',
    'DROP/* outer /* inner */ outer */TABLE demo.bookmark;',
    true,
  ],
  [
    'comment-separated drop column is destructive',
    'ALTER TABLE demo.bookmark DROP/**/COLUMN title;',
    true,
  ],
  ['line-comment-separated drop is destructive', 'DROP-- comment\nTABLE demo.bookmark;', true],
  [
    'qualified dot survives nested comments',
    "SELECT evil. /* outer /* inner */ outer */ pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'qualified dot survives line comments',
    "SELECT evil. -- comment\n pg_catalog.has_table_privilege('app', 'demo.bookmark', 'TRUNCATE');",
    true,
  ],
  [
    'DO body comment-separated drop is destructive',
    'DO $$ BEGIN DROP/**/TABLE demo.bookmark; END $$;',
    true,
  ],
] as const;

for (const [name, sql, destructive] of inquiryCases) {
  test(`LINT005 catalog boundary: ${name}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-lint005-inspector-'));
    try {
      const file = join(root, 'migration.sql');
      writeFileSync(file, sql);
      const result = await lintSqlTarget(file);
      assert.deepEqual(result.parserIssues, [], JSON.stringify(result.parserIssues));
      assert.equal(
        result.issues.some((issue) => issue.code === 'LINT005'),
        destructive,
        sql,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}

const malformedInquiryCases = [
  [
    'unclosed privilege literal',
    "SELECT pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE);",
  ],
  [
    'unclosed inquiry call',
    "SELECT pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE';",
  ],
  [
    'unclosed dollar body',
    "DO $body$ BEGIN PERFORM pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE'); END;",
  ],
  [
    'unclosed nested comment',
    "SELECT /* outer /* inner */ pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE');",
  ],
  [
    'extra tokens after privilege',
    "SELECT pg_catalog.has_table_privilege('app','demo.bookmark','TRUNCATE' nonsense nonsense);",
  ],
] as const;

for (const [name, sql] of malformedInquiryCases) {
  test(`LINT005 refuses malformed inquiry: ${name}`, async () => {
    const root = mkdtempSync(join(tmpdir(), 'stynx-lint005-malformed-'));
    try {
      const file = join(root, 'migration.sql');
      writeFileSync(file, sql);
      const result = await lintSqlTarget(file);
      assert.ok(
        result.parserIssues.length > 0 || result.issues.some((issue) => issue.code === 'LINT005'),
        sql,
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
