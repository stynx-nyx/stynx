import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const verifier = readFileSync(join(root, 'scripts/verify-devai-trace.mjs'));
const executable = `import { it, expect } from 'vitest';
import assert from 'node:assert/strict';

it('keeps the exact behavioral assertions', () => {
  expect(1 + 1).toBe(2);
  assert.equal('tenant-a', 'tenant-a');
});
`;
// Independent known call sites, not a copy of the verifier's extraction algorithm.
const expectedProjection = ['5:expect(1 + 1).toBe(2);', "6:assert.equal('tenant-a', 'tenant-a');"];
const projectionDigest = (lines) => createHash('sha256').update(lines.join('\n')).digest('hex');
const binding = (path) => ({
  path,
  assertion_count: 2,
  assertion_digest_sha256: projectionDigest(expectedProjection),
});

function withFixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'stynx-trace-é '));
  const environment = { ...process.env };
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE']) delete environment[key];
  function write(path, bytes) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), bytes);
  }
  function git(...args) {
    return execFileSync('git', args, {
      cwd: directory,
      env: environment,
      encoding: 'utf8',
      timeout: 5000,
    });
  }
  function check(...args) {
    const result = spawnSync(process.execPath, ['scripts/verify-devai-trace.mjs', ...args], {
      cwd: directory,
      env: environment,
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    return result;
  }
  try {
    git('init', '--quiet');
    write('scripts/verify-devai-trace.mjs', verifier);
    write('law/trace.json', JSON.stringify({ test_corpus: [] }));
    git('add', '--', 'scripts/verify-devai-trace.mjs', 'law/trace.json');
    return run({ directory, write, git, check });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

for (const path of [
  'packages/sample/test/unit/behavior.spec.ts',
  'test/scripts/behavior.test.mjs',
]) {
  test(`actual trace verifier preserves existing executable binding for ${path}`, () => {
    withFixture(({ write, git, check }) => {
      write(path, executable);
      write('law/trace.json', JSON.stringify({ test_corpus: [binding(path)] }));
      git('add', '--', path);
      const result = check();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /1 executable tests bound; 1 tracked/u);
    });
  });
}

for (const path of [
  'reference/api/test/e2e/flows/behavior.e2e.ts',
  'packages/sample/test/wiring/behavior.wiring-spec.ts',
]) {
  test(`actual trace verifier refuses an unbound tracked ${path}`, () => {
    withFixture(({ write, git, check }) => {
      write(path, executable);
      git('add', '--', path);
      const result = check('--print');
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`executable test missing from trace: ${path}`));
      assert.deepEqual(JSON.parse(result.stdout), [
        {
          path,
          count: 2,
          digest: projectionDigest(expectedProjection),
        },
      ]);
    });
  });

  test(`actual trace verifier admits the exact ${path} projection and leaves fixture app.ts outside the corpus`, () => {
    withFixture(({ write, git, check }) => {
      const fixture = 'reference/api/test/e2e/fixtures/app.ts';
      write(path, executable);
      write(fixture, 'export function createFixture() { return { ready: true }; }\n');
      write('law/trace.json', JSON.stringify({ test_corpus: [binding(path)] }));
      git('add', '--', path, fixture);
      const result = check();
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /1 executable tests bound; 1 tracked/u);
    });
  });

  test(`actual trace verifier refuses assertion-text drift without a count change in ${path}`, () => {
    withFixture(({ write, git, check }) => {
      write(path, executable.replace('expect(1 + 1).toBe(2)', 'expect(1 + 1).toBe(3)'));
      write('law/trace.json', JSON.stringify({ test_corpus: [binding(path)] }));
      git('add', '--', path);
      const result = check('--print');
      assert.equal(result.status, 1);
      assert.ok(result.stderr.includes(`assertion binding drifted for ${path}`));
      assert.deepEqual(JSON.parse(result.stdout), [
        {
          path,
          count: 2,
          digest: projectionDigest([
            '5:expect(1 + 1).toBe(3);',
            "6:assert.equal('tenant-a', 'tenant-a');",
          ]),
        },
      ]);
    });
  });
}

test('actual trace verifier refuses a stale count even when the assertion digest is exact', () => {
  withFixture(({ write, git, check }) => {
    const path = 'packages/sample/test/wiring/count.wiring-spec.ts';
    write(path, executable);
    write(
      'law/trace.json',
      JSON.stringify({
        test_corpus: [{ ...binding(path), assertion_count: 1 }],
      }),
    );
    git('add', '--', path);
    const result = check('--print');
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`assertion binding drifted for ${path}`));
    assert.deepEqual(JSON.parse(result.stdout), [
      {
        path,
        count: 2,
        digest: binding(path).assertion_digest_sha256,
      },
    ]);
  });
});

test('actual trace verifier refuses a tracked executable removed from the fixture worktree', () => {
  withFixture(({ directory, write, git, check }) => {
    const path = 'reference/api/test/e2e/flows/missing.e2e.ts';
    write(path, executable);
    write('law/trace.json', JSON.stringify({ test_corpus: [binding(path)] }));
    git('add', '--', path);
    rmSync(join(directory, path));
    const result = check();
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`untracked or missing test path: ${path}`));
  });
});

test('actual trace verifier refuses an existing executable that was never tracked', () => {
  withFixture(({ write, check }) => {
    const path = 'packages/sample/test/wiring/untracked.wiring-spec.ts';
    write(path, executable);
    write('law/trace.json', JSON.stringify({ test_corpus: [binding(path)] }));
    const result = check();
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`untracked or missing test path: ${path}`));
  });
});

test('actual trace verifier refuses an ordinary e2e app fixture incorrectly bound as executable', () => {
  withFixture(({ write, git, check }) => {
    const path = 'reference/api/test/e2e/fixtures/app.ts';
    write(path, 'export function createFixture() { return { ready: true }; }\n');
    write('law/trace.json', JSON.stringify({ test_corpus: [binding(path)] }));
    git('add', '--', path);
    const result = check();
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes(`non-executable path in test_corpus: ${path}`));
  });
});
