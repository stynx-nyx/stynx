import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, test } from 'node:test';

// ADR-DEVAI-ADOPTION-0021: execute the installed published CLI and actual generated shell
// hook. Synthetic repository inputs are sensor fixtures, never approved effects,
// merge receipts, workflow execution, native measurements or release readiness.
const repoRoot = resolve(import.meta.dirname, '../..');
const cli = join(repoRoot, 'node_modules/@aarusso-nyx/devai/dist/runtime/index/bin.js');
const hook = readFileSync(join(repoRoot, '.husky/post-merge'));
const actualProject = JSON.parse(readFileSync(join(repoRoot, '.devai/config/project.json')));
const roots = new Set();
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const environment = { ...process.env, PATH: `${dirname(process.execPath)}:${process.env.PATH}` };
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});
function root() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'stynx DEVAI2.6 espaço 日本語 ')));
  roots.add(directory);
  return directory;
}
function put(directory, path, bytes) {
  const target = join(directory, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
}
function files(directory, prefix = '') {
  return readdirSync(join(directory, prefix), { withFileTypes: true })
    .flatMap((entry) => {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) return files(directory, path);
      return [
        {
          path,
          sha256: entry.isSymbolicLink() ? 'SYMLINK' : sha(readFileSync(join(directory, path))),
        },
      ];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}
function workflow(steps = '      - name: Read\n        run: node scripts/check.mjs\n') {
  return `name: Fixture\non: push\njobs:\n  inspect:\n    runs-on: ubuntu-latest\n    steps:\n${steps}`;
}
function inventoryFixture(source = workflow()) {
  const directory = root();
  // Exact approved bound policy bytes admit the read-only sensor. No registered
  // binding, private local attestation or host enforcement is manufactured here.
  for (const path of ['.devai/config', '.devai/pin', 'law/policy'])
    cpSync(join(repoRoot, path), join(directory, path), { recursive: true });
  put(directory, '.github/workflows/check.yml', source);
  put(
    directory,
    'scripts/check.mjs',
    "import './leaf.mjs';\nthrow new Error('WORKFLOW MUST NOT EXECUTE');\n",
  );
  put(directory, 'scripts/leaf.mjs', 'export const value = 1;\n');
  return directory;
}
function inventory(directory, expectedStatus = 'complete') {
  const before = files(directory);
  const result = spawnSync(
    process.execPath,
    [
      cli,
      'sense',
      'inventory',
      '--slice',
      'workflows',
      '--repo-root',
      directory,
      '--format',
      'json',
    ],
    {
      cwd: repoRoot,
      env: environment,
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(
    result.status,
    expectedStatus === 'complete' ? 0 : 1,
    result.stderr || result.stdout,
  );
  const document = JSON.parse(result.stdout);
  assert.equal(document.ok, true);
  assert.equal(document.action_id, 'sense inventory');
  const value = document.result.value;
  assert.equal(document.result.verdict, expectedStatus === 'complete' ? 'pass' : 'review');
  assert.equal(value.status, expectedStatus === 'complete' ? 'pass' : 'review');
  assert.equal(value.slice, 'workflows');
  assert.deepEqual(value.members, ['workflow-step-inventory']);
  assert.equal(value.implicit_persistence, false);
  assert.equal(value.results.length, 1);
  assert.equal(value.results[0].member, 'workflow-step-inventory');
  assert.deepEqual(
    files(directory),
    before,
    'read-only extraction changed actual fixture bytes or population',
  );
  return value.results[0].value;
}
function closure(document) {
  return document.workflows[0].steps[0].closure;
}

test('installed workflow inventory has exact occurrences, transitive actual file hashes and no execution or persistence', () => {
  const directory = inventoryFixture();
  const first = inventory(directory);
  assert.equal(first.status, 'complete');
  assert.equal(first.reason, null);
  assert.equal(first.workflows.length, 1);
  const actual = first.workflows[0];
  assert.equal(actual.path, '.github/workflows/check.yml');
  assert.equal(actual.sha256, sha(readFileSync(join(directory, actual.path))));
  assert.equal(actual.status, 'complete');
  assert.equal(actual.steps.length, 1);
  const step = actual.steps[0];
  assert.equal(step.occurrence, '.github/workflows/check.yml#inspect[0]');
  assert.equal(step.index, 0);
  assert.equal(step.job, 'inspect');
  assert.equal(step.name, 'Read');
  assert.match(step.sha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(step.closure, {
    status: 'complete',
    reason: null,
    files: ['scripts/check.mjs', 'scripts/leaf.mjs'].map((path) => ({
      path,
      sha256: sha(readFileSync(join(directory, path))),
    })),
  });
  assert.deepEqual(inventory(directory), first);
  for (const key of [
    'reviewedEffect',
    'originVerified',
    'readinessPromoting',
    'performanceQualified',
  ])
    assert.equal(Object.hasOwn(first, key), false);
});

test('physical zero-based occurrences distinguish repeated step names without dropping either member', () => {
  const directory = inventoryFixture(
    workflow(
      '      - name: Repeated\n        run: node scripts/check.mjs\n      - name: Repeated\n        run: node scripts/leaf.mjs\n',
    ),
  );
  const actual = inventory(directory);
  assert.equal(actual.status, 'complete');
  assert.deepEqual(
    actual.workflows[0].steps.map(({ occurrence, index, name }) => ({ occurrence, index, name })),
    [
      { occurrence: '.github/workflows/check.yml#inspect[0]', index: 0, name: 'Repeated' },
      { occurrence: '.github/workflows/check.yml#inspect[1]', index: 1, name: 'Repeated' },
    ],
  );
  assert.notEqual(actual.workflows[0].steps[0].sha256, actual.workflows[0].steps[1].sha256);
});

test('canonical step digest survives YAML map ordering while a changed import updates only acquired closure identity', () => {
  const directory = inventoryFixture();
  const original = inventory(directory);
  put(
    directory,
    '.github/workflows/check.yml',
    workflow('      - run: node scripts/check.mjs\n        name: Read\n'),
  );
  const reordered = inventory(directory);
  assert.equal(reordered.workflows[0].steps[0].sha256, original.workflows[0].steps[0].sha256);
  assert.notEqual(reordered.workflows[0].sha256, original.workflows[0].sha256);
  put(directory, 'scripts/leaf.mjs', 'export const value = 2;\n');
  const changed = inventory(directory);
  assert.equal(changed.status, 'complete');
  assert.equal(changed.workflows[0].steps[0].sha256, original.workflows[0].steps[0].sha256);
  assert.notEqual(closure(changed).files[1].sha256, closure(original).files[1].sha256);
  assert.equal(
    closure(changed).files[1].sha256,
    sha(readFileSync(join(directory, 'scripts/leaf.mjs'))),
  );
});

for (const [label, change] of [
  [
    'remote uses without contained executable closure',
    (directory) =>
      put(
        directory,
        '.github/workflows/check.yml',
        workflow('      - uses: actions/checkout@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n'),
      ),
  ],
  [
    'computed import without reviewed complete cover',
    (directory) => put(directory, 'scripts/check.mjs', 'await import(process.env.MODULE);\n'),
  ],
  ['missing directly executed file', (directory) => rmSync(join(directory, 'scripts/check.mjs'))],
  ['missing transitive imported file', (directory) => rmSync(join(directory, 'scripts/leaf.mjs'))],
  [
    'transitive import outside contained root',
    (directory) => put(directory, 'scripts/check.mjs', "import '../../outside.mjs';\n"),
  ],
  [
    'symlink transitive source',
    (directory) => {
      rmSync(join(directory, 'scripts/leaf.mjs'));
      symlinkSync(
        join(repoRoot, 'scripts/lib/http-original-scenarios.mjs'),
        join(directory, 'scripts/leaf.mjs'),
      );
    },
  ],
  [
    'duplicate YAML keys',
    (directory) => put(directory, '.github/workflows/check.yml', `${workflow()}jobs: {}\n`),
  ],
])
  test(`installed workflow inventory retains UNKNOWN for ${label}`, () => {
    const directory = inventoryFixture();
    change(directory);
    const actual = inventory(directory, 'unknown');
    assert.equal(actual.status, 'unknown');
    assert.equal(actual.reason, 'WORKFLOW_INVENTORY_INCOMPLETE');
    assert.equal(actual.workflows[0].status, 'unknown');
  });

test('empty workflow population remains explicit UNKNOWN rather than vacuous completeness', () => {
  const directory = inventoryFixture();
  rmSync(join(directory, '.github/workflows/check.yml'));
  assert.deepEqual(inventory(directory, 'unknown'), {
    schemaVersion: '1.0.0',
    status: 'unknown',
    reason: 'WORKFLOW_INVENTORY_EMPTY',
    workflows: [],
  });
});

function hookFixture(project) {
  const directory = root();
  put(directory, '.husky/post-merge', hook);
  if (project !== undefined)
    put(
      directory,
      '.devai/config/project.json',
      typeof project === 'string' ? project : JSON.stringify(project),
    );
  return directory;
}
function invokeHook(directory) {
  const result = spawnSync('/bin/sh', ['.husky/post-merge'], {
    cwd: directory,
    env: environment,
    encoding: 'utf8',
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  return result;
}
for (const selection of [
  { mode: 'cli-only' },
  { mode: 'host-integrated', adapter_config: '.devai/config/github-actions-host-adapter.json' },
])
  test(`actual installed generated hook skips nonselected ${selection.mode}/${selection.adapter_config ?? 'none'} without issuer or round-close resources`, () => {
    const directory = hookFixture({ ...actualProject, authority_enforcement: selection });
    const before = files(directory);
    const result = invokeHook(directory);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'POST_MERGE_HOOK_NOT_SELECTED\n');
    assert.deepEqual(files(directory), before);
    assert.equal(existsSync(join(directory, '.git')), false);
    assert.equal(existsSync(join(directory, 'node_modules')), false);
  });
for (const [label, project] of [
  ['missing project', undefined],
  ['malformed JSON', '{'],
  ['array project', []],
  ['unknown schema', { ...actualProject, schemaVersion: '99' }],
  ['unknown project field', { ...actualProject, unreviewed: true }],
  ['missing selection', { ...actualProject, authority_enforcement: undefined }],
  ['unknown mode', { ...actualProject, authority_enforcement: { mode: 'automatic' } }],
  [
    'unknown adapter',
    {
      ...actualProject,
      authority_enforcement: {
        mode: 'host-integrated',
        adapter_config: '.devai/config/unknown.json',
      },
    },
  ],
  [
    'unknown selection field',
    { ...actualProject, authority_enforcement: { mode: 'cli-only', bypass: true } },
  ],
])
  test(`actual generated hook refuses ${label} without issuer or receipt effects`, () => {
    const directory = hookFixture(project);
    const before = files(directory);
    const result = invokeHook(directory);
    assert.equal(result.status, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'POST_MERGE_HOOK_SELECTION_INVALID\n');
    assert.deepEqual(files(directory), before);
  });

test('actual selected local hook retains bound issuer checks and refuses genuine nonmerge round-close', () => {
  assert.deepEqual(actualProject.authority_enforcement, {
    mode: 'host-integrated',
    adapter_config: '.devai/config/post-merge-host-adapter.json',
  });
  const tracked = spawnSync('git', ['ls-files', '-z', '.devai', 'record', 'law/policy'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(tracked.status, 0);
  const before = new Map(
    tracked.stdout
      .split('\0')
      .filter(Boolean)
      .map((path) => [path, sha(readFileSync(join(repoRoot, path)))]),
  );
  const result = invokeHook(repoRoot);
  assert.equal(result.status, 2, result.stderr);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /host receipt not a merge/u);
  assert.doesNotMatch(
    result.stderr,
    /POST_MERGE_HOOK_NOT_SELECTED|POST_MERGE_HOOK_SELECTION_INVALID/u,
  );
  const gitDirectory = spawnSync('git', ['rev-parse', '--absolute-git-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(gitDirectory.status, 0);
  const receiptPath = join(gitDirectory.stdout.trim(), 'devai/post-merge-receipt.json');
  const receipt = JSON.parse(readFileSync(receiptPath));
  assert.equal(lstatSync(receiptPath).mode & 0o777, 0o600);
  const attestation = JSON.parse(
    readFileSync(join(gitDirectory.stdout.trim(), 'devai/post-merge-host-adapter.json')),
  );
  assert.equal(receipt.adapter_id, attestation.adapter_id);
  assert.match(receipt.adapter_id, /^post-merge-[a-f0-9]{16}$/u);
  assert.equal(receipt.hook_digest_sha256, sha(hook));
  assert.match(receipt.signature_hmac_sha256, /^[a-f0-9]{64}$/u);
  for (const [path, digest] of before)
    assert.equal(sha(readFileSync(join(repoRoot, path))), digest, path);
});
