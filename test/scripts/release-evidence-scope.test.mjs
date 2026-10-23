import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolvePublicationEvidenceRequirements } from '../../scripts/lib/release-evidence-scope.mjs';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (root, path) => JSON.parse(readFileSync(join(root, path), 'utf8'));
function write(root, path, value) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), `${JSON.stringify(value, null, 2)}\n`);
}
function fixture(t, version = '1.6.0') {
  const root = mkdtempSync(join(tmpdir(), 'stynx-release-scope-inspector-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const path of [
    'package.json',
    `law/schemas/release-scope-${version}.schema.json`,
    `law/policy/release-scope-${version}.json`,
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repository, path), join(root, path));
  }
  // The 1.6.x scopes bind the 44-package roster bytes they were released with.
  cpSync(
    join(
      repository,
      version.startsWith('1.')
        ? 'test/fixtures/release-scope/stynx-package-roster-44.json'
        : 'law/policy/stynx-package-roster.json',
    ),
    join(root, 'law/policy/stynx-package-roster.json'),
  );
  // Each scope binds the task descriptor bytes it was released with; 1.6.1
  // through 3.0.0 share one reviewed descriptor.
  cpSync(
    join(
      repository,
      version === '1.6.0'
        ? 'test/fixtures/release-scope/test-tasks-1.6.0.json'
        : 'test/fixtures/release-scope/test-tasks-3.0.0.json',
    ),
    join(root, 'test-tasks.json'),
  );
  for (const name of read(root, 'law/policy/stynx-package-roster.json').publishable_packages) {
    const shortName = name.split('/')[1];
    // The production discovery function reads the real complete filesystem population.
    write(root, `packages/${shortName}/package.json`, { name, version });
  }
  mkdirSync(join(root, 'packages-web'));
  mkdirSync(join(root, 'tools'));
  write(root, 'package.json', { ...read(root, 'package.json'), version });
  return root;
}
const mutate = (root, path, transform) => write(root, path, transform(read(root, path)));

// INV-REL-001: data fixtures establish selection/refusal only, never signed RC standing.
test('exact scoped version retains all 44 packages and 15 RC nodes and reports omissions honestly', (t) => {
  const root = fixture(t);
  const selected = resolvePublicationEvidenceRequirements(root);
  assert.deepEqual(selected.requiredChecks, [
    ['verified-local-rc', 'signed exact-candidate local RC'],
  ]);
  assert.equal(selected.scope.packageRoster.count, 44);
  assert.equal(selected.scope.rc.requiredNodes.length, 15);
  assert.deepEqual(selected.scope.omitted, {
    httpPerformance: 'NOT_OBSERVED',
    k6: 'NOT_OBSERVED',
    mutation: 'NOT_RUN',
  });
  assert.equal(selected.scope.audit.requiredOverallPass, false);
  assert.equal(selected.scope.audit.readinessPromoting, false);
  assert.equal(selected.scope.productionProviderApprovalClaimed, false);
});

for (const version of ['1.5.7', '1.7.0', '2.0.0', '1.6.0-rc.1'])
  test(`version ${version} retains original k6 requirement without scoped policy authority`, (t) => {
    const root = fixture(t);
    mutate(root, 'package.json', (value) => ({ ...value, version }));
    rmSync(join(root, 'law/schemas/release-scope-1.6.0.schema.json'));
    assert.deepEqual(resolvePublicationEvidenceRequirements(root), {
      scope: null,
      requiredChecks: [['k6', 'hardening scenario=all']],
    });
  });

for (const [label, change] of [
  [
    'schema byte change',
    (root) =>
      writeFileSync(
        join(root, 'law/schemas/release-scope-1.6.0.schema.json'),
        `${readFileSync(join(root, 'law/schemas/release-scope-1.6.0.schema.json'))} `,
      ),
  ],
  [
    'policy extra field',
    (root) => mutate(root, 'law/policy/release-scope-1.6.0.json', (v) => ({ ...v, bypass: true })),
  ],
  [
    'policy omitted measurement becomes PASS',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.0.json', (v) => ({
        ...v,
        omitted: { ...v.omitted, k6: 'PASS' },
      })),
  ],
  [
    'policy required check override',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.0.json', (v) => ({
        ...v,
        rc: { ...v.rc, requiredCheck: 'invented' },
      })),
  ],
  [
    'policy readiness promotion',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.0.json', (v) => ({
        ...v,
        audit: { ...v.audit, readinessPromoting: true },
      })),
  ],
  ['missing policy', (root) => rmSync(join(root, 'law/policy/release-scope-1.6.0.json'))],
  [
    'malformed policy JSON',
    (root) => writeFileSync(join(root, 'law/policy/release-scope-1.6.0.json'), '{'),
  ],
  [
    'roster exact byte change',
    (root) =>
      writeFileSync(
        join(root, 'law/policy/stynx-package-roster.json'),
        `${readFileSync(join(root, 'law/policy/stynx-package-roster.json'))} `,
      ),
  ],
  [
    'mixed package version',
    (root) => mutate(root, 'packages/core/package.json', (v) => ({ ...v, version: '1.5.7' })),
  ],
  ['missing package', (root) => rmSync(join(root, 'packages/core'), { recursive: true })],
  [
    'extra package',
    (root) =>
      write(root, 'packages/extra/package.json', { name: '@stynx-nyx/extra', version: '1.6.0' }),
  ],
  [
    'duplicate package',
    (root) =>
      write(root, 'packages/duplicate/package.json', { name: '@stynx-nyx/core', version: '1.6.0' }),
  ],
  [
    'missing RC task',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.filter((x) => x.nodeId !== 'security'),
      })),
  ],
  [
    'duplicate RC task',
    (root) => mutate(root, 'test-tasks.json', (v) => ({ ...v, tasks: [...v.tasks, v.tasks[0]] })),
  ],
  [
    'removed RC dependency',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.map((x) =>
          x.nodeId === 'release:prepare'
            ? { ...x, dependencies: x.dependencies.filter((id) => id !== 'docs') }
            : x,
        ),
      })),
  ],
  [
    'new RC dependency',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.map((x) =>
          x.nodeId === 'release:prepare'
            ? { ...x, dependencies: [...x.dependencies, 'test:mutation'] }
            : x,
        ),
      })),
  ],
  [
    'same-node command weakening',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.map((x) =>
          x.nodeId === 'security' ? { ...x, argv: ['node', '-e', 'process.exit(0)'] } : x,
        ),
      })),
  ],
  [
    'same-node environment weakening',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.map((x) =>
          x.nodeId === 'security' ? { ...x, allowlistedEnv: [...x.allowlistedEnv, 'BYPASS'] } : x,
        ),
      })),
  ],
  [
    'descriptor byte change',
    (root) =>
      writeFileSync(
        join(root, 'test-tasks.json'),
        `${readFileSync(join(root, 'test-tasks.json'))} `,
      ),
  ],
  [
    'nonfixed RC profile',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        profiles: v.profiles.map((x) => (x.profileId === 'rc' ? { ...x, mode: 'dynamic' } : x)),
      })),
  ],
])
  test(`scoped selection refuses ${label}`, (t) => {
    const root = fixture(t);
    change(root);
    assert.throws(() => resolvePublicationEvidenceRequirements(root));
  });

function actualVerifier(t, runs, { version = '1.6.0', dirty = false } = {}) {
  const root = fixture(t, ['1.6.0', '1.6.1', '1.6.2'].includes(version) ? version : '1.6.0');
  mutate(root, 'package.json', (value) => ({ ...value, version }));
  for (const path of [
    'scripts/verify-missing-evidence.mjs',
    'scripts/lib/release-evidence-scope.mjs',
    'scripts/lib/publishable-packages.mjs',
    'scripts/lib/mutation-roster.mjs',
  ]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    cpSync(join(repository, path), join(root, path));
  }
  const git = (args) => {
    const result = spawnSync('/usr/bin/git', ['-C', root, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git(['init', '-q']);
  git(['add', '.']);
  git([
    '-c',
    'user.name=Inspector fixture',
    '-c',
    'user.email=inspector@example.invalid',
    '-c',
    'core.hooksPath=/dev/null',
    'commit',
    '-qm',
    'fixture',
  ]);
  const candidate = git(['rev-parse', 'HEAD']);
  const transport = mkdtempSync(join(tmpdir(), 'stynx-check-api-transport-'));
  t.after(() => rmSync(transport, { recursive: true, force: true }));
  const api = join(transport, 'gh');
  // Controlled external GitHub transport, not authenticated or release evidence.
  writeFileSync(
    api,
    `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(JSON.stringify({ check_runs: runs(candidate) }))});\n`,
  );
  chmodSync(api, 0o700);
  if (dirty) writeFileSync(join(root, 'untracked'), 'dirty');
  return spawnSync(process.execPath, ['scripts/verify-missing-evidence.mjs'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      STYNX_ENABLE_REGISTRY_PUBLISH: 'true',
      GITHUB_REPOSITORY: 'stynx-nyx/stynx',
      PATH: `${transport}:/usr/bin:/bin`,
    },
  });
}
const check = (head_sha, changes = {}) => ({
  name: 'verified-local-rc',
  head_sha,
  status: 'completed',
  conclusion: 'success',
  ...changes,
});
for (const [label, runs, accepted] of [
  ['one exact successful check', (sha) => [check(sha)], true],
  ['unrelated check retained', (sha) => [check(sha), check(sha, { name: 'unrelated' })], true],
  ['missing required check', () => [], false],
  ['stale required head', () => [check('0'.repeat(40))], false],
  ['failed check', (sha) => [check(sha, { conclusion: 'failure' })], false],
  ['incomplete check', (sha) => [check(sha, { status: 'in_progress', conclusion: null })], false],
  ['duplicate successful checks', (sha) => [check(sha), check(sha)], false],
  [
    'successful plus failed duplicate',
    (sha) => [check(sha), check(sha, { conclusion: 'failure' })],
    false,
  ],
  [
    'successful plus running duplicate',
    (sha) => [check(sha), check(sha, { status: 'in_progress', conclusion: null })],
    false,
  ],
  ['k6 cannot substitute scoped RC', (sha) => [check(sha, { name: 'k6' })], false],
])
  test(`actual verifier process ${accepted ? 'accepts' : 'refuses'} ${label}`, (t) => {
    const result = actualVerifier(t, runs);
    assert.equal(result.error, undefined);
    assert.equal(result.status, accepted ? 0 : 1, result.stderr || result.stdout);
    const row = JSON.parse(result.stdout.trim());
    assert.equal(row.ok, accepted);
    assert.equal(row.scope.version, '1.6.0');
  });
test('actual verifier refuses dirty exact-head worktree despite successful check', (t) => {
  const result = actualVerifier(t, (sha) => [check(sha)], { dirty: true });
  assert.equal(result.status, 1);
  assert.ok(JSON.parse(result.stdout).failures.includes('candidate worktree is not clean'));
});
test('actual verifier retains successful k6 requirement for old version', (t) => {
  const result = actualVerifier(t, (sha) => [check(sha, { name: 'k6' })], { version: '1.5.7' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).scope, null);
});

// INV-REL-001: prospective patch authority remains closed and nonpromoting.
test('1.6.1 selects its own exact authority and retains all mandatory RC nodes', (t) => {
  const root = fixture(t, '1.6.1');
  const selected = resolvePublicationEvidenceRequirements(root);
  assert.deepEqual(selected.requiredChecks, [
    ['verified-local-rc', 'signed exact-candidate local RC'],
  ]);
  assert.equal(selected.scope.version, '1.6.1');
  assert.equal(selected.scope.packageRoster.count, 44);
  assert.equal(selected.scope.rc.requiredNodes.length, 15);
  assert.deepEqual(
    selected.scope.rc.requiredNodes,
    read(repository, 'law/policy/release-scope-1.6.0.json').rc.requiredNodes,
  );
  assert.deepEqual(selected.scope.omitted, {
    httpPerformance: 'NOT_OBSERVED',
    k6: 'NOT_OBSERVED',
    mutation: 'NOT_RUN',
  });
  assert.deepEqual(selected.scope.audit, {
    requiredOverallPass: false,
    readinessPromoting: false,
    preserveHistorical: true,
  });
  assert.equal(selected.scope.productionProviderApprovalClaimed, false);
  assert.equal(selected.scope.consumerAcceptanceRequiredForPublication, false);
});

for (const [label, change] of [
  ['missing policy', (root) => rmSync(join(root, 'law/policy/release-scope-1.6.1.json'))],
  ['missing schema', (root) => rmSync(join(root, 'law/schemas/release-scope-1.6.1.schema.json'))],
  [
    'schema bytes',
    (root) =>
      writeFileSync(
        join(root, 'law/schemas/release-scope-1.6.1.schema.json'),
        readFileSync(join(root, 'law/schemas/release-scope-1.6.1.schema.json'), 'utf8') + ' ',
      ),
  ],
  [
    'policy extra field',
    (root) => mutate(root, 'law/policy/release-scope-1.6.1.json', (v) => ({ ...v, bypass: true })),
  ],
  [
    'false omitted PASS',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.1.json', (v) => ({
        ...v,
        omitted: { ...v.omitted, k6: 'PASS' },
      })),
  ],
  [
    'readiness promotion',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.1.json', (v) => ({
        ...v,
        audit: { ...v.audit, readinessPromoting: true },
      })),
  ],
  [
    'RC command change',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.map((task) =>
          task.nodeId === 'security' ? { ...task, argv: ['node', '-e', 'process.exit(0)'] } : task,
        ),
      })),
  ],
  [
    'historical task substitution',
    (root) =>
      cpSync(
        join(repository, 'test/fixtures/release-scope/test-tasks-1.6.0.json'),
        join(root, 'test-tasks.json'),
      ),
  ],
  [
    'mixed package version',
    (root) => mutate(root, 'packages/core/package.json', (v) => ({ ...v, version: '1.6.0' })),
  ],
  ['missing package', (root) => rmSync(join(root, 'packages/core'), { recursive: true })],
])
  test(`1.6.1 scoped selection refuses ${label}`, (t) => {
    const root = fixture(t, '1.6.1');
    change(root);
    assert.throws(() => resolvePublicationEvidenceRequirements(root));
  });

test('1.6.2 binds the complete published RC graph and keeps omissions nonpromoting', (t) => {
  const root = fixture(t, '1.6.2');
  const selected = resolvePublicationEvidenceRequirements(root);
  const prior = read(repository, 'law/policy/release-scope-1.6.1.json');
  assert.equal(selected.scope.version, '1.6.2');
  assert.equal(selected.scope.packageRoster.count, 44);
  assert.deepEqual(selected.scope.rc.requiredNodes, prior.rc.requiredNodes);
  assert.equal(selected.scope.rc.requiredNodes.length, 15);
  assert.deepEqual(selected.requiredChecks, [
    ['verified-local-rc', 'signed exact-candidate local RC'],
  ]);
  assert.deepEqual(selected.scope.omitted, {
    httpPerformance: 'NOT_OBSERVED',
    k6: 'NOT_OBSERVED',
    mutation: 'NOT_RUN',
  });
  assert.deepEqual(selected.scope.audit, {
    requiredOverallPass: false,
    readinessPromoting: false,
    preserveHistorical: true,
  });
  assert.equal(selected.scope.productionProviderApprovalClaimed, false);
  assert.equal(selected.scope.consumerAcceptanceRequiredForPublication, false);
});

for (const [label, change] of [
  ['missing closed policy', (root) => rmSync(join(root, 'law/policy/release-scope-1.6.2.json'))],
  [
    'schema byte drift',
    (root) =>
      writeFileSync(
        join(root, 'law/schemas/release-scope-1.6.2.schema.json'),
        readFileSync(join(root, 'law/schemas/release-scope-1.6.2.schema.json')) + ' ',
      ),
  ],
  [
    'scope expansion',
    (root) => mutate(root, 'law/policy/release-scope-1.6.2.json', (v) => ({ ...v, bypass: true })),
  ],
  [
    'promoted omission',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.2.json', (v) => ({
        ...v,
        omitted: { ...v.omitted, k6: 'PASS' },
      })),
  ],
  [
    'readiness promotion',
    (root) =>
      mutate(root, 'law/policy/release-scope-1.6.2.json', (v) => ({
        ...v,
        audit: { ...v.audit, readinessPromoting: true },
      })),
  ],
  [
    'roster byte drift',
    (root) =>
      writeFileSync(
        join(root, 'law/policy/stynx-package-roster.json'),
        readFileSync(join(root, 'law/policy/stynx-package-roster.json')) + ' ',
      ),
  ],
  [
    'mixed package version',
    (root) => mutate(root, 'packages/core/package.json', (v) => ({ ...v, version: '1.6.1' })),
  ],
  [
    'removed security task',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.filter((task) => task.nodeId !== 'security'),
      })),
  ],
  [
    'security command bypass',
    (root) =>
      mutate(root, 'test-tasks.json', (v) => ({
        ...v,
        tasks: v.tasks.map((task) =>
          task.nodeId === 'security' ? { ...task, argv: ['node', '-e', 'process.exit(0)'] } : task,
        ),
      })),
  ],
  [
    'descriptor byte drift',
    (root) =>
      writeFileSync(
        join(root, 'test-tasks.json'),
        readFileSync(join(root, 'test-tasks.json')) + ' ',
      ),
  ],
])
  test(`1.6.2 refuses ${label}`, (t) => {
    const root = fixture(t, '1.6.2');
    change(root);
    assert.throws(() => resolvePublicationEvidenceRequirements(root));
  });

test('1.6.2 actual verifier requires unique successful exact-head RC evidence', (t) => {
  for (const [runs, accepted] of [
    [(sha) => [check(sha)], true],
    [() => [check('0'.repeat(40))], false],
    [(sha) => [check(sha), check(sha)], false],
    [(sha) => [check(sha, { conclusion: 'failure' })], false],
  ]) {
    const result = actualVerifier(t, runs, { version: '1.6.2' });
    assert.equal(result.status, accepted ? 0 : 1, result.stderr || result.stdout);
    const report = JSON.parse(result.stdout.trim());
    assert.equal(report.ok, accepted);
    assert.equal(report.scope.version, '1.6.2');
  }
});

// ADR-RELEASE-0006: the SM-21 major release scopes the 47-package roster.
test('3.0.0 binds the 47-package roster and keeps omissions nonpromoting', (t) => {
  const root = fixture(t, '3.0.0');
  const selected = resolvePublicationEvidenceRequirements(root);
  const prior = read(repository, 'law/policy/release-scope-1.6.2.json');
  assert.equal(selected.scope.version, '3.0.0');
  assert.equal(selected.scope.packageRoster.count, 47);
  assert.deepEqual(selected.scope.rc.requiredNodes, prior.rc.requiredNodes);
  assert.deepEqual(selected.requiredChecks, [
    ['verified-local-rc', 'signed exact-candidate local RC'],
  ]);
  assert.deepEqual(selected.scope.omitted, {
    httpPerformance: 'NOT_OBSERVED',
    k6: 'NOT_OBSERVED',
    mutation: 'NOT_RUN',
  });
  assert.equal(selected.scope.audit.readinessPromoting, false);
});

for (const [label, change] of [
  [
    '44-package roster',
    (root) =>
      cpSync(
        join(repository, 'test/fixtures/release-scope/stynx-package-roster-44.json'),
        join(root, 'law/policy/stynx-package-roster.json'),
      ),
  ],
  ['missing tool package', (root) => rmSync(join(root, 'packages/tsconfig'), { recursive: true })],
  [
    'tool package left at 1.6.2',
    (root) =>
      mutate(root, 'packages/eslint-config/package.json', (v) => ({ ...v, version: '1.6.2' })),
  ],
])
  test(`3.0.0 refuses ${label}`, (t) => {
    const root = fixture(t, '3.0.0');
    change(root);
    assert.throws(
      () => resolvePublicationEvidenceRequirements(root),
      /STYNX_RELEASE_SCOPE_INVALID/u,
    );
  });
