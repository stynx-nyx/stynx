import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  const result = await lintSqlTarget(join(repoRoot, 'reference', 'api', 'migrations', '0001_reference.sql'));
  assert.equal(result.parserIssues.length, 0);
  assert.deepEqual(result.issues, []);
});

test('cli returns parser exit code 2 on invalid SQL', async () => {
  const invalidFixture = join(fixturesDir, 'parser-error.sql');
  const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, invalidFixture, '--format=json'], {
    cwd: repoRoot,
  }).then(
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

  const { stdout } = await execFileAsync(process.execPath, [cliPath, fixture, '--format=json', '--fix-suggestions'], {
    cwd: repoRoot,
  }).then(
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
