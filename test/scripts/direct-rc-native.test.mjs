import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const source = fileURLToPath(new URL('../../scripts/devai-local-rc.mjs', import.meta.url));
const probe = fileURLToPath(new URL('./support/direct-rc-native-probe.mjs', import.meta.url));
const root = '/synthetic/stynx';
const candidate = 'a'.repeat(40);
const tree = 'b'.repeat(40);
function observe(scenario) {
  const child = spawnSync(
    process.execPath,
    ['--experimental-vm-modules', probe, source, scenario],
    {
      encoding: 'utf8',
      timeout: 10000,
      env: {},
    },
  );
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.status, 0, child.stderr);
  const value = JSON.parse(child.stdout);
  assert.deepEqual(value.actualEffects, []);
  assert.equal(
    value.trace.some((event) => event.op === 'read' && /never-read/u.test(event.path)),
    false,
  );
  for (const event of value.trace.filter((entry) => entry.op === 'spawn')) {
    assert.equal(event.envIdentity, true);
    assert.deepEqual(
      { ...event.options, env: undefined },
      {
        cwd: root,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: 'pipe',
        shell: false,
        env: undefined,
      },
    );
  }
  return value;
}
const controlOps = ['realpath', 'read', 'mkdir', 'write', 'write'];
const prepareOps = [
  'realpath',
  'spawn',
  'spawn',
  'spawn',
  'spawn',
  'read',
  'read',
  'exists',
  'read',
  'realpath',
  'realpath',
  'read',
  'read',
  'read',
  'read',
  'spawn',
  'spawn',
  'exists',
  'spawn',
  'realpath',
  'realpath',
  'realpath',
  'spawn',
];
for (const [scenario, toolchain, environment] of [
  ['controls', { node: process.version }, {}],
  ['required-string', { node: process.version }, { ABSENT: null }],
  ['toolchain-env-scalars', {}, { 7: null }],
]) {
  test(`intercepted actual RC retains ${scenario} native descriptor values`, () => {
    const result = observe(scenario);
    assert.equal(result.exit, 0);
    assert.deepEqual(result.stderr, []);
    assert.deepEqual(
      result.trace.map((entry) => entry.op),
      controlOps,
    );
    assert.deepEqual(result.trace[2], {
      op: 'mkdir',
      path: '/synthetic-controls-output',
      options: { recursive: true, mode: 0o700 },
    });
    assert.deepEqual(result.trace.slice(3), [
      {
        op: 'write',
        path: '/synthetic-controls-output/toolchain.json',
        body: `${JSON.stringify(toolchain, null, 2)}\n`,
        options: { mode: 0o600 },
      },
      {
        op: 'write',
        path: '/synthetic-controls-output/environment.json',
        body: `${JSON.stringify(environment, null, 2)}\n`,
        options: { mode: 0o600 },
      },
    ]);
    assert.deepEqual(result.stdout, [
      `${JSON.stringify({ ok: true, toolchain: '/synthetic-controls-output/toolchain.json', environment: '/synthetic-controls-output/environment.json' })}\n`,
    ]);
  });
}

test('intercepted actual RC prepare retains child arguments, order and forwarded receipt paths', () => {
  const result = observe('prepare');
  assert.equal(result.exit, 0);
  assert.deepEqual(result.stderr, []);
  assert.deepEqual(
    result.trace.map((entry) => entry.op),
    prepareOps,
  );
  const children = result.trace.filter((entry) => entry.op === 'spawn');
  assert.deepEqual(
    children.map(({ command, args }) => [command, args]),
    [
      ['git', ['-C', root, 'rev-parse', 'HEAD']],
      ['git', ['-C', root, 'status', '--porcelain']],
      ['git', ['-C', root, 'rev-parse', 'HEAD^{tree}']],
      ['pnpm', ['--version']],
      ['pnpm', ['--filter', '@stynx-nyx/reference-web', 'exec', 'playwright', '--version']],
      ['pg_isready', ['-h', 'synthetic', '-p', '0', '-U', 'synthetic', '-d', 'synthetic']],
      [
        `${root}/node_modules/.bin/devai`,
        [
          'check',
          '--rc',
          '--run',
          '--task-timeout-ms',
          '21600000',
          '--repo-root',
          root,
          '--as-role',
          'inspector',
          '--write',
          '--format',
          'json',
        ],
      ],
      [
        process.execPath,
        [
          `${root}/node_modules/@aarusso-nyx/devai/dist/runtime/evidence-verification/src/export-cli.js`,
          '--repo',
          root,
          '--receipt',
          `${root}/receipt.json`,
          '--results-dir',
          `${root}/.devai/state/check-cache/v1/results`,
          '--profile',
          'rc',
          '--commit',
          candidate,
          '--tree',
          tree,
          '--toolchain',
          '/synthetic-controls/toolchain.json',
          '--environment',
          '/synthetic-controls/environment.json',
          '--private-key',
          '/synthetic-controls/never-read-private',
          '--public-key',
          '/synthetic-controls/never-read-public',
          '--signer-id',
          'stynx-inspector-workstation-03',
          '--output-dir',
          `/synthetic-evidence/${candidate}/digest`,
        ],
      ],
    ],
  );
  assert.deepEqual(JSON.parse(result.stdout.join('')), {
    ok: true,
    candidate,
    tree,
    receipt: 'digest',
    taskPolicyDigest: 'synthetic-policy',
    bundle: `/synthetic-evidence/${candidate}/digest`,
    manifest: `/synthetic-evidence/${candidate}/digest/manifest.json`,
  });
});

for (const [scenario, message] of [
  ['task-map-null', "Cannot read properties of null (reading 'map')"],
  ['unknown-task', 'RC profile names unknown task missing'],
  ['required-number', 'profile.requiredNodes is not iterable'],
  ['dependency-number', 'Spread syntax requires ...iterable[Symbol.iterator] to be a function'],
  ['dependency-null', 'task.dependencies is not iterable (cannot read property null)'],
  ['dependency-missing', 'task.dependencies is not iterable (cannot read property undefined)'],
]) {
  test(`intercepted actual RC preserves ${scenario} refusal before writes or children`, () => {
    const result = observe(scenario);
    assert.equal(result.exit, 2);
    assert.deepEqual(result.stdout, []);
    assert.deepEqual(result.stderr, [
      `${JSON.stringify({ ok: false, code: 'STYNX_LOCAL_RC', message })}\n`,
    ]);
    assert.deepEqual(result.trace, [
      { op: 'realpath', path: root },
      { op: 'read', path: `${root}/test-tasks.json`, encoding: 'utf8' },
    ]);
  });
}

for (const [scenario, operation, args, message] of [
  [
    'digest-number',
    'join-error',
    ['/synthetic-evidence', candidate, 7],
    'The "path" argument must be of type string. Received type number (7)',
  ],
  [
    'path-number',
    'resolve-error',
    [root, 7],
    'The "paths[1]" argument must be of type string. Received type number (7)',
  ],
]) {
  test(`intercepted actual RC preserves native ${scenario} path error before export`, () => {
    const result = observe(scenario);
    assert.equal(result.exit, 2);
    assert.deepEqual(result.stdout, []);
    assert.deepEqual(result.stderr, [
      `${JSON.stringify({ ok: false, code: 'STYNX_LOCAL_RC', message })}\n`,
    ]);
    assert.deepEqual(
      result.trace.map((entry) => entry.op),
      [...prepareOps.slice(0, -1), operation],
    );
    assert.deepEqual(result.trace.at(-1), {
      op: operation,
      args,
      name: 'TypeError',
      code: 'ERR_INVALID_ARG_TYPE',
    });
  });
}

test('intercepted actual RC refuses missing receipt before key paths and export', () => {
  const result = observe('missing-receipt');
  assert.equal(result.exit, 2);
  assert.deepEqual(result.stdout, []);
  assert.deepEqual(result.stderr, [
    `${JSON.stringify({ ok: false, code: 'STYNX_LOCAL_RC', message: 'DEVAI RC run produced no receipt' })}\n`,
  ]);
  assert.deepEqual(
    result.trace.map((entry) => entry.op),
    prepareOps.slice(0, 19),
  );
  assert.equal(result.trace.at(-1).command, `${root}/node_modules/.bin/devai`);
});
