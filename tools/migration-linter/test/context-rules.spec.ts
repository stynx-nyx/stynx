import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { lintSqlTarget, lintSqlTargets } from '../src/lint.js';
import { LINT_CODES } from '../src/types.js';

const execFileAsync = promisify(execFile);
const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..', '..');
const fixturesDir = join(packageRoot, 'test', 'fixtures');
const contextDir = join(fixturesDir, 'context');
const cliPath = join(packageRoot, 'dist', 'src', 'cli.js');

interface CliRun {
  status: number;
  stdout: string;
  stderr: string;
}

async function runCli(args: string[], cwd: string, cli = cliPath): Promise<CliRun> {
  return execFileAsync(process.execPath, [cli, ...args], { cwd }).then(
    ({ stdout, stderr }) => ({ status: 0, stdout, stderr }),
    (error: NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string }) => ({
      status: typeof error.code === 'number' ? error.code : -1,
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
    }),
  );
}

function codes(result: { issues: Array<{ code: string }> }): string[] {
  return result.issues.map((issue) => issue.code);
}

/** Copies the LINT013 fixture into `<scratch>/migrations` with its manifest beside it. */
function appliedWorkspace(): string {
  const scratch = mkdtempSync(join(tmpdir(), 'stynx-lint013-'));
  mkdirSync(join(scratch, 'migrations'));
  cpSync(
    join(contextDir, 'lint013', '0001_applied.sql'),
    join(scratch, 'migrations', '0001_applied.sql'),
  );
  cpSync(join(contextDir, 'lint013', 'manifest.sha256'), join(scratch, 'manifest.sha256'));
  return scratch;
}

function changeOneByte(path: string): void {
  const bytes = readFileSync(path);
  const index = bytes.indexOf('label');
  assert.ok(index >= 0);
  bytes[index] = 'L'.charCodeAt(0);
  writeFileSync(path, bytes);
}

test('LINT_CODES publishes LINT010 through LINT013', () => {
  for (const code of ['LINT010', 'LINT011', 'LINT012', 'LINT013']) {
    assert.ok((LINT_CODES as readonly string[]).includes(code), code);
  }
});

test('LINT010 two roots sharing 0012_ yield exactly LINT010 and exit 1', async () => {
  const roots = [join(contextDir, 'lint010', 'root-a'), join(contextDir, 'lint010', 'root-b')];
  const result = await lintSqlTargets(roots);
  assert.deepEqual(codes(result), ['LINT010']);
  assert.equal(result.files.length, 3);
  assert.match(result.issues[0]?.message ?? '', /0012_/);

  const run = await runCli([...roots, '--format=json'], packageRoot);
  assert.equal(run.status, 1, run.stderr);
  assert.deepEqual(codes(JSON.parse(run.stdout)), ['LINT010']);
});

test('LINT010 each root alone is clean', async () => {
  for (const root of ['root-a', 'root-b']) {
    const result = await lintSqlTarget(join(contextDir, 'lint010', root));
    assert.deepEqual(codes(result), [], root);
  }
});

test('LINT011 an auth. GUC in a policy yields exactly LINT011 and exit 1', async () => {
  const result = await lintSqlTarget(join(fixturesDir, 'lint011-fail.sql'));
  assert.deepEqual(codes(result), ['LINT011']);
  assert.equal(result.issues[0]?.line, 11);
  assert.match(result.issues[0]?.message ?? '', /auth\.current_tenant/);

  const run = await runCli([join(fixturesDir, 'lint011-fail.sql'), '--format=json'], packageRoot);
  assert.equal(run.status, 1, run.stderr);
  assert.deepEqual(codes(JSON.parse(run.stdout)), ['LINT011']);
});

test('LINT011 app.* GUCs in a policy are clean', async () => {
  const result = await lintSqlTarget(join(fixturesDir, 'lint011-pass.sql'));
  assert.deepEqual(codes(result), []);
  assert.deepEqual(result.parserIssues, []);
});

test('LINT012 a PII column without @pii yields exactly LINT012 under --lgpd and is accepted without it', async () => {
  const fixture = join(fixturesDir, 'lint012-fail.sql');
  const lgpd = await lintSqlTarget(fixture, { lgpd: true });
  assert.deepEqual(codes(lgpd), ['LINT012']);
  assert.equal(lgpd.issues[0]?.line, 3);
  assert.match(lgpd.issues[0]?.message ?? '', /primary_email/);
  assert.deepEqual(codes(await lintSqlTarget(fixture)), []);

  const withFlag = await runCli([fixture, '--format=json', '--lgpd'], packageRoot);
  assert.equal(withFlag.status, 1, withFlag.stderr);
  assert.deepEqual(codes(JSON.parse(withFlag.stdout)), ['LINT012']);
  const withoutFlag = await runCli([fixture, '--format=json'], packageRoot);
  assert.equal(withoutFlag.status, 0, withoutFlag.stderr);
});

test('LINT012 annotated PII columns (above, trailing, ADD COLUMN) are clean under --lgpd', async () => {
  const result = await lintSqlTarget(join(fixturesDir, 'lint012-pass.sql'), { lgpd: true });
  assert.deepEqual(codes(result), []);
  assert.deepEqual(result.parserIssues, []);
});

test('LINT012 an @pii annotation without basis and retention is rejected', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'stynx-lint012-'));
  try {
    const file = join(scratch, '0001_contact.sql');
    writeFileSync(
      file,
      'CREATE TABLE acme.contact (\n  id uuid PRIMARY KEY,\n  cpf text -- @pii: yes\n);\n',
    );
    const result = await lintSqlTarget(file, { lgpd: true });
    assert.deepEqual(codes(result), ['LINT012']);
    assert.match(result.issues[0]?.message ?? '', /basis and retention/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('LINT013 one byte changed in a manifest-listed file yields exactly LINT013 and exit 1', async () => {
  const scratch = appliedWorkspace();
  try {
    const args = ['migrations', '--format=json', '--manifest', 'manifest.sha256'];
    const clean = await runCli(args, scratch);
    assert.equal(clean.status, 0, clean.stderr);
    assert.deepEqual(JSON.parse(clean.stdout).issues, []);

    changeOneByte(join(scratch, 'migrations', '0001_applied.sql'));
    const changed = await runCli(args, scratch);
    assert.equal(changed.status, 1, changed.stderr);
    assert.deepEqual(codes(JSON.parse(changed.stdout)), ['LINT013']);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('LINT013 a manifest-listed file that was removed is reported', async () => {
  const scratch = appliedWorkspace();
  try {
    rmSync(join(scratch, 'migrations', '0001_applied.sql'));
    writeFileSync(join(scratch, 'migrations', '0002_next.sql'), 'SELECT 1;\n');
    const run = await runCli(
      ['migrations', '--format=json', '--manifest=manifest.sha256'],
      scratch,
    );
    assert.equal(run.status, 1, run.stderr);
    assert.deepEqual(codes(JSON.parse(run.stdout)), ['LINT013']);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('LINT013 a file present in --base-dir must be byte-identical at head', async () => {
  const scratch = appliedWorkspace();
  try {
    mkdirSync(join(scratch, 'base', 'migrations'), { recursive: true });
    cpSync(
      join(scratch, 'migrations', '0001_applied.sql'),
      join(scratch, 'base', 'migrations', '0001_applied.sql'),
    );
    const args = ['migrations', '--format=json', '--base-dir', 'base'];
    assert.equal((await runCli(args, scratch)).status, 0);

    changeOneByte(join(scratch, 'migrations', '0001_applied.sql'));
    const changed = await runCli(args, scratch);
    assert.equal(changed.status, 1, changed.stderr);
    assert.deepEqual(codes(JSON.parse(changed.stdout)), ['LINT013']);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('full-flag run emits JSON and exits 0 on a clean population, never Unknown flag', async () => {
  const scratch = appliedWorkspace();
  try {
    mkdirSync(join(scratch, 'base'));
    const run = await runCli(
      [
        'migrations',
        '--format=json',
        '--lgpd',
        '--base-dir',
        'base',
        '--manifest',
        'manifest.sha256',
        '--fix-suggestions',
      ],
      scratch,
    );
    assert.doesNotMatch(run.stderr, /Unknown flag/);
    assert.equal(run.status, 0, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.deepEqual(output.files, ['migrations/0001_applied.sql']);
    assert.deepEqual(output.issues, []);
    assert.deepEqual(output.parserIssues, []);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('a missing --manifest path exits 2 with an explicit error', async () => {
  const run = await runCli(
    [
      join(fixturesDir, 'lint011-pass.sql'),
      '--format=json',
      '--manifest',
      join(contextDir, 'absent.sha256'),
    ],
    packageRoot,
  );
  assert.equal(run.status, 2);
  assert.equal(run.stdout, '');
  assert.match(run.stderr, /--manifest .*absent\.sha256 does not exist/);
});

test('a malformed manifest or a missing --base-dir exits 2', async () => {
  const scratch = appliedWorkspace();
  try {
    writeFileSync(join(scratch, 'bad.sha256'), 'not-a-digest migrations/0001_applied.sql\n');
    const malformed = await runCli(
      ['migrations', '--format=json', '--manifest', 'bad.sha256'],
      scratch,
    );
    assert.equal(malformed.status, 2);
    assert.match(malformed.stderr, /sha256sum form/);

    const missingBase = await runCli(
      ['migrations', '--format=json', '--base-dir', 'absent'],
      scratch,
    );
    assert.equal(missingBase.status, 2);
    assert.match(missingBase.stderr, /--base-dir absent does not exist/);

    const missingValue = await runCli(['migrations', '--manifest'], scratch);
    assert.equal(missingValue.status, 2);
    assert.match(missingValue.stderr, /--manifest requires a value/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('pg-query-emscripten unavailable exits 2 with parserIssues, never a clean result', async () => {
  const scratch = mkdtempSync(join(tmpdir(), 'stynx-no-parser-'));
  try {
    cpSync(join(packageRoot, 'dist', 'src'), join(scratch, 'src'), { recursive: true });
    writeFileSync(join(scratch, 'package.json'), '{"type":"module"}\n');
    const run = await runCli(
      [join(fixturesDir, 'lint011-pass.sql'), '--format=json'],
      scratch,
      join(scratch, 'src', 'cli.js'),
    );
    assert.equal(run.status, 2, run.stderr);
    const output = JSON.parse(run.stdout);
    assert.equal(output.files.length, 1);
    assert.equal(output.parserIssues.length, 1);
    assert.match(output.parserIssues[0].message, /pg-query-emscripten could not be loaded/);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test('unknown flags still fail closed with exit 2', async () => {
  const run = await runCli([join(fixturesDir, 'lint011-pass.sql'), '--nope'], packageRoot);
  assert.equal(run.status, 2);
  assert.match(run.stderr, /Unknown flag: --nope/);
});
