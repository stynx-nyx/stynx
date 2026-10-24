import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import test from 'node:test';

const repo = resolve(import.meta.dirname, '../..');
const baseline = JSON.parse(
  readFileSync(join(repo, 'test/fixtures/unit-budget/f85c9b8c.json'), 'utf8'),
);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const additions = [
  ...[
    'package.json',
    'pnpm-workspace.yaml',
    'turbo.json',
    'test-tasks.json',
    'tools/repo-config/vitest.base.mjs',
  ].map((pattern) => ({ kind: 'exact', pattern })),
  ...['packages', 'packages-web', 'tools', 'test'].map((root) => ({
    kind: 'glob',
    pattern: `${root}/*/package.json`,
  })),
  ...['packages', 'packages-web', 'tools', 'test'].map((root) => ({
    kind: 'glob',
    pattern: `${root}/*/vitest.config.*`,
  })),
];
const capped = (command) =>
  command
    .replaceAll('vitest run', 'vitest run --maxWorkers=1')
    .replaceAll('node --test', 'node --test --test-concurrency=1');
function expected() {
  const value = structuredClone(baseline);
  value.rootScripts.test += ' --concurrency=2';
  for (const manifest of Object.values(value.manifests))
    manifest.scripts.test = capped(manifest.scripts.test);
  value.taskDescriptor.tasks
    .find((task) => task.nodeId === 'test:unit')
    .inputSelectors.push(...additions);
  return value;
}
function actual() {
  const manifests = {};
  for (const area of ['packages', 'packages-web', 'tools', 'test']) {
    for (const directory of readdirSync(join(repo, area), { withFileTypes: true })) {
      const path = `${area}/${directory.name}/package.json`;
      if (!directory.isDirectory() || !existsSync(join(repo, path))) continue;
      const manifest = JSON.parse(readFileSync(join(repo, path), 'utf8'));
      if (manifest.scripts?.test)
        manifests[path] = { name: manifest.name, scripts: manifest.scripts };
    }
  }
  return {
    baselineCommit: baseline.baselineCommit,
    rootScripts: JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')).scripts,
    manifests,
    unchangedFiles: Object.fromEntries(
      Object.keys(baseline.unchangedFiles).map((path) => [
        path,
        sha(readFileSync(join(repo, path))),
      ]),
    ),
    taskDescriptor: JSON.parse(readFileSync(join(repo, 'test-tasks.json'), 'utf8')),
  };
}
function assertBudget(value) {
  const reference = expected();
  assert.deepEqual(
    Object.keys(value.manifests).sort(),
    Object.keys(reference.manifests).sort(),
    'complete ordinary package roster',
  );
  assert.deepEqual(
    value.rootScripts,
    reference.rootScripts,
    'root command, filters and all other gates',
  );
  assert.deepEqual(
    value.manifests,
    reference.manifests,
    'exact runner caps with every original config/population/chained command retained',
  );
  assert.deepEqual(
    value.unchangedFiles,
    reference.unchangedFiles,
    'unchanged configs, thresholds, isolation and task dependency topology',
  );
  assert.deepEqual(
    value.taskDescriptor,
    reference.taskDescriptor,
    'only reviewed additive unit inputs; all tasks/dependencies/profile population retained',
  );
}

test('contract: ordinary-unit complete roster has exactly the reviewed bounded commands', () => {
  assert.equal(Object.keys(baseline.manifests).length, 50);
  assert.equal(
    Object.values(baseline.manifests).filter((value) => value.scripts.test.includes('vitest run'))
      .length,
    46,
  );
  assert.equal(
    Object.values(baseline.manifests).filter((value) => value.scripts.test.includes('node --test'))
      .length,
    5,
  );
  assertBudget(actual());
});
for (const [name, mutate] of [
  [
    'missing package cap',
    (v) => {
      v.manifests['packages-web/sdk/package.json'].scripts.test =
        baseline.manifests['packages-web/sdk/package.json'].scripts.test;
    },
  ],
  [
    'increased package slots',
    (v) => {
      v.rootScripts.test = v.rootScripts.test.replace('--concurrency=2', '--concurrency=3');
    },
  ],
  [
    'later cap override',
    (v) => {
      v.manifests['packages-web/sdk/package.json'].scripts.test += ' --maxWorkers=8';
    },
  ],
  [
    'percent cap escape',
    (v) => {
      v.manifests['packages-web/sdk/package.json'].scripts.test = v.manifests[
        'packages-web/sdk/package.json'
      ].scripts.test.replace('--maxWorkers=1', '--maxWorkers=100%');
    },
  ],
  [
    'environment budget escape',
    (v) => {
      v.rootScripts.test = 'VITEST_MAX_THREADS=8 ' + v.rootScripts.test;
    },
  ],
  [
    'dropped package population',
    (v) => {
      delete v.manifests['packages-web/sdk/package.json'];
    },
  ],
  [
    'narrowed root population',
    (v) => {
      v.rootScripts.test = v.rootScripts.test.replace(" --filter='./tools/*'", '');
    },
  ],
  [
    'dropped validation tail',
    (v) => {
      v.manifests['test/scripts/package.json'].scripts.test = v.manifests[
        'test/scripts/package.json'
      ].scripts.test.replace(' && node validate.js', '');
    },
  ],
  [
    'narrowed node file set',
    (v) => {
      v.manifests['test/scripts/package.json'].scripts.test = v.manifests[
        'test/scripts/package.json'
      ].scripts.test.replace('./*.test.mjs', './one.test.mjs');
    },
  ],
  [
    'inflated test timeout',
    (v) => {
      v.manifests['packages-web/sdk/package.json'].scripts.test += ' --testTimeout=120000';
    },
  ],
  [
    'changed coverage/isolation defaults',
    (v) => {
      v.unchangedFiles['tools/repo-config/vitest.base.mjs'] = '0'.repeat(64);
    },
  ],
  [
    'changed task graph/cache',
    (v) => {
      v.unchangedFiles['turbo.json'] = '0'.repeat(64);
    },
  ],
  [
    'removed unit dependency',
    (v) => {
      v.taskDescriptor.tasks.find((task) => task.nodeId === 'test:unit').dependencies = [];
    },
  ],
  [
    'missing manifest input',
    (v) => {
      v.taskDescriptor.tasks.find((task) => task.nodeId === 'test:unit').inputSelectors.pop();
    },
  ],
  [
    'E2E cap outside amendment',
    (v) => {
      v.rootScripts['test:e2e'] += ' --concurrency=2';
    },
  ],
  [
    'integration scheduling change',
    (v) => {
      v.rootScripts['test:int'] = v.rootScripts['test:int'].replace(
        '--concurrency=1',
        '--concurrency=2',
      );
    },
  ],
]) {
  test(`contract: rejects ${name}`, () => {
    const value = expected();
    mutate(value);
    assert.throws(() => assertBudget(value));
  });
}

const workerBody = (directory, id, fail) => `
import { writeFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const directory = ${JSON.stringify(directory)};
async function work() {
  writeFileSync(directory + '/started-${id}', JSON.stringify({pid:process.pid}));
  const deadline = Date.now() + 12000;
  while (!existsSync(directory + '/release-${id}')) {
    if (Date.now() > deadline) throw new Error('fixture release deadline');
    await delay(10);
  }
  writeFileSync(directory + '/finished-${id}', 'done');
  if (${fail}) throw new Error('intentional bounded fixture failure');
}
`;
async function barrier(t, kind, fail, abortAtBarrier = false) {
  const directory = mkdtempSync(join(repo, '.unit-budget-fixture-'));
  const state = join(directory, 'state');
  mkdirSync(state);
  let child;
  t.after(async () => {
    if (child) {
      const alive = () => {
        try {
          process.kill(-child.pid, 0);
          return true;
        } catch (error) {
          if (error.code === 'ESRCH') return false;
          throw error;
        }
      };
      if (alive()) process.kill(-child.pid, 'SIGTERM');
      const grace = Date.now() + 2000;
      while (alive() && Date.now() < grace) await delay(20);
      if (alive()) process.kill(-child.pid, 'SIGKILL');
      const deadline = Date.now() + 2000;
      while (alive() && Date.now() < deadline) await delay(20);
      assert.equal(alive(), false, 'owned fixture group must exit before its directory is removed');
    }
    rmSync(directory, { recursive: true, force: true });
  });
  const write = (path, value) => {
    mkdirSync(resolve(path, '..'), { recursive: true });
    writeFileSync(path, value);
  };
  let args;
  let command = process.execPath;
  const limit = kind === 'turbo' ? 2 : 1;
  if (kind === 'turbo') {
    write(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'unit-budget-fixture', private: true, packageManager: 'pnpm@9.15.0' }),
    );
    write(join(directory, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    write(
      join(directory, 'pnpm-lock.yaml'),
      "lockfileVersion: '9.0'\nimporters:\n  .: {}\n" +
        [0, 1, 2, 3].map((id) => `  packages/p${id}: {}\n`).join(''),
    );
    write(join(directory, 'turbo.json'), JSON.stringify({ tasks: { test: { cache: false } } }));
    for (let id = 0; id < 4; id++) {
      write(
        join(directory, `packages/p${id}/package.json`),
        JSON.stringify({
          name: `budget-${id}`,
          scripts: { test: `${JSON.stringify(process.execPath)} worker.mjs` },
        }),
      );
      write(
        join(directory, `packages/p${id}/worker.mjs`),
        workerBody(state, id, fail && id === 3) + '\nawait work();\n',
      );
    }
    command = join(repo, 'node_modules/.bin/turbo');
    const cap = actual().rootScripts.test.match(/--concurrency=\S+/u)?.[0];
    assert.equal(cap, '--concurrency=2');
    args = ['run', 'test', cap, '--no-daemon', '--output-logs=errors-only'];
  } else {
    for (let id = 0; id < 4; id++) {
      const imported =
        kind === 'node'
          ? 'node:test'
          : pathToFileURL(join(repo, 'node_modules/vitest/dist/index.js')).href;
      write(
        join(directory, `${id}.spec.mjs`),
        `import { test } from ${JSON.stringify(imported)};\n` +
          workerBody(state, id, fail && id === 3) +
          `\ntest('worker ${id}', work);\n`,
      );
    }
    if (kind === 'node') {
      const cap =
        actual().manifests['test/scripts/package.json'].scripts.test.match(
          /--test-concurrency=\S+/u,
        )?.[0];
      assert.equal(cap, '--test-concurrency=1');
      args = ['--test', cap, ...[0, 1, 2, 3].map((id) => `${id}.spec.mjs`)];
    } else {
      write(
        join(directory, 'vitest.config.mjs'),
        "export default { test: { include: ['*.spec.mjs'], testTimeout: 15000 } };\n",
      );
      const cap =
        actual().manifests['packages-web/sdk/package.json'].scripts.test.match(
          /--maxWorkers=\S+/u,
        )?.[0];
      assert.equal(cap, '--maxWorkers=1');
      args = [
        join(repo, 'node_modules/vitest/vitest.mjs'),
        'run',
        '--config',
        'vitest.config.mjs',
        cap,
      ];
    }
  }
  const childEnv = { ...process.env, TURBO_TELEMETRY_DISABLED: '1' };
  // This is a separately owned runner, not recursive execution inside the
  // parent's Node test worker. Retain all other environment and actual argv.
  delete childEnv.NODE_TEST_CONTEXT;
  child = spawn(command, args, {
    cwd: directory,
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (bytes) => {
    stdout += bytes;
  });
  child.stderr.on('data', (bytes) => {
    stderr += bytes;
  });
  const completion = new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal }));
  });
  const deadline = Date.now() + 20000;
  let peak = 0;
  let held = false;
  while (Date.now() < deadline) {
    const files = readdirSync(state);
    const started = files
      .filter((file) => file.startsWith('started-'))
      .map((file) => file.slice(8));
    const active = started.filter((id) => !files.includes(`finished-${id}`));
    peak = Math.max(peak, active.length);
    assert.ok(active.length <= limit, `${kind} exceeded budget: ${active.length}`);
    if (active.length === limit && !held) {
      if (abortAtBarrier) throw new Error('intentional barrier assertion interruption');
      await delay(150);
      held = true;
      assert.equal(
        readdirSync(state).filter((file) => file.startsWith('started-')).length,
        limit,
        'barrier must prevent admission of the next file/package',
      );
    }
    if (held) for (const id of active) writeFileSync(join(state, `release-${id}`), 'release');
    if (files.filter((file) => file.startsWith('finished-')).length === 4) break;
    if (child.exitCode !== null) break;
    await delay(20);
  }
  const finishedCount = readdirSync(state).filter((file) => file.startsWith('finished-')).length;
  if (fail && kind === 'turbo') assert.ok(finishedCount > 0, stdout + stderr);
  else assert.equal(finishedCount, 4, stdout + stderr);
  assert.equal(peak, limit, 'actual runner must exercise the admitted capacity');
  let exitTimer;
  let result;
  try {
    result = await Promise.race([
      completion,
      new Promise((_, reject) => {
        exitTimer = setTimeout(() => reject(new Error('fixture child did not exit')), 5000);
      }),
    ]);
  } finally {
    clearTimeout(exitTimer);
  }
  t.diagnostic(
    JSON.stringify({
      runner: kind,
      limit,
      peakObservedActive: peak,
      finishedCount,
      exitCode: result.code,
      expectedFailure: fail,
    }),
  );
  assert.equal(result.signal, null);
  if (fail) assert.notEqual(result.code, 0, stdout + stderr);
  else assert.equal(result.code, 0, stdout + stderr);
  // Preserve Turbo's existing failure cancellation; success proves the full
  // eventual roster, while failure proves nonzero propagation and cleanup.
  if (!fail || kind !== 'turbo')
    for (let id = 0; id < 4; id++)
      assert.ok(existsSync(join(state, `started-${id}`)), 'complete eventual fixture population');
  await delay(50);
  assert.throws(
    () => process.kill(-child.pid, 0),
    (error) => error.code === 'ESRCH',
    'no owned child/process group remains',
  );
  child = undefined;
}
for (const kind of ['turbo', 'vitest', 'node'])
  for (const fail of [false, true]) {
    test(
      `runtime: actual ${kind} budget preserves population, ${fail ? 'failure' : 'success'} and cleanup`,
      { timeout: 30000 },
      (t) => barrier(t, kind, fail),
    );
  }

test(
  'runtime: aborted barrier waits for owned workers before deleting fixture',
  { timeout: 30000 },
  async (t) => {
    await assert.rejects(
      () => barrier(t, 'node', false, true),
      /intentional barrier assertion interruption/u,
    );
  },
);
