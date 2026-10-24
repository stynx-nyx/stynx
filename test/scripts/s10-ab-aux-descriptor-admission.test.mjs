import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Auxiliary-only observer: never merge this file or the exceptional workflow into product C.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// Inspector-owned independent pins, bound after the official baseline and reviewed W0.
// Intermediate candidates and drifted identities must refuse.
const C = '677b7770413d7123df19fd9dfad3f723285d9b20';
const candidateTree = '7260437fa73aeb37776da6fe1be3605cd52966be';
assert.match(C ?? '', /^[0-9a-f]{40}$/u, 'final independently reviewed candidate is not bound');
assert.match(candidateTree ?? '', /^[0-9a-f]{40}$/u, 'final independently reviewed tree is not bound');
const M = 'aa2c11305034918ba253d57ba66e0438f9ff1e78';
const workflowPath = '.github/workflows/devai-local-rc-verify.yml';
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
const committed = (ref, path) =>
  execFileSync('git', ['show', `${ref}:${path}`], { cwd: repository, encoding: 'utf8' });
const originalWorkflow = committed(C, workflowPath);
const workflow = readFileSync(join(repository, workflowPath), 'utf8');
const start = workflow.indexOf('      # Auxiliary-only A+B admission.');
const end = workflow.indexOf('      - name: Reconstruct exact RC task policy', start);
assert.ok(start >= 0 && end > start, 'exact authored auxiliary step must exist');
const step = workflow.slice(start, end);
const run = step
  .slice(step.indexOf('        run: |\n') + '        run: |\n'.length)
  .split('\n')
  .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
  .join('\n')
  .trimEnd();
const provider = process.env.STYNX_TRUSTED_EVIDENCE_POLICY;
assert.ok(provider, 'supply the independently archive-verified, workflow-pinned 2.4.0 policy CLI');
const { canonicalBytes, sha256Hex } = await import(
  pathToFileURL(join(dirname(provider), 'canonical.js')).href
);
const control = JSON.parse(committed(M, 'test-tasks.json'));
const candidate = JSON.parse(committed(C, 'test-tasks.json'));
const task = (descriptor, id) => descriptor.tasks.find((entry) => entry.nodeId === id);

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-s10-ab-aux-guard-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, ref, descriptor] of [
    ['candidate', C, candidate],
    ['control', M, control],
  ]) {
    // Real Git identity checks, shared immutable objects; no candidate checkout or imports.
    execFileSync('git', [
      'clone',
      '--shared',
      '--no-checkout',
      '--quiet',
      repository,
      join(root, name),
    ]);
    git(join(root, name), 'update-ref', '--no-deref', 'HEAD', ref);
    writeFileSync(join(root, name, 'test-tasks.json'), JSON.stringify(descriptor));
  }
  return root;
}
function write(root, side, value) {
  writeFileSync(
    join(root, side, 'test-tasks.json'),
    typeof value === 'string' ? value : JSON.stringify(value),
  );
}
function invoke(root, source = run, sha = C) {
  const output = join(root, 'output');
  rmSync(output, { force: true });
  const result = spawnSync('/bin/bash', ['-c', source], {
    cwd: root,
    encoding: 'utf8',
    timeout: 10000,
    env: {
      PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
      CANDIDATE_SHA: sha,
      DEVAI_EVIDENCE_POLICY: provider,
      GITHUB_OUTPUT: output,
    },
  });
  assert.equal(result.error, undefined, result.error?.message);
  return { ...result, output: existsSync(output) ? readFileSync(output, 'utf8') : '' };
}
function refuses(result, reason) {
  assert.notEqual(result.status, 0, result.stdout + result.stderr);
  assert.equal(result.output, '', 'refusal must not select a descriptor');
  if (reason) assert.match(result.stderr, new RegExp(reason));
}

test('auxiliary workflow differs from frozen generated core only by guard and descriptor selection', () => {
  const stripped = (workflow.slice(0, start) + workflow.slice(end)).replace(
    '--descriptor "${{ steps.descriptor.outputs.path }}"',
    '--descriptor control/test-tasks.json',
  );
  assert.equal(stripped, originalWorkflow);
  assert.equal(workflow.split('--descriptor "${{ steps.descriptor.outputs.path }}"').length, 2);
  assert.match(workflow, /--toolchain control\/law\/policy\/devai-local-rc-toolchain.json/);
  assert.match(workflow, /--environment control\/law\/policy\/devai-local-rc-environment.json/);
  assert.match(workflow, /cmp .*expected-task-policy.json.*task-policy.json/);
  assert.equal(control.tasks.length, 17);
  assert.equal(candidate.tasks.length, 17);
  const closure = (descriptor) => {
    const visited = new Set();
    const visit = (id) => {
      if (visited.has(id)) return;
      const entry = task(descriptor, id);
      assert.ok(entry, `declared task ${id} must exist`);
      visited.add(id);
      entry.dependencies.forEach(visit);
    };
    descriptor.profiles.find((p) => p.profileId === 'rc').requiredNodes.forEach(visit);
    return [...visited].sort();
  };
  assert.equal(closure(candidate).length, 15);
  assert.deepEqual(closure(candidate), closure(control));
});

test('actual trusted canonical implementation binds both reviewed descriptor digests and exact three appends', () => {
  assert.equal(
    sha256Hex(canonicalBytes(control)),
    'b7f8b028b6cbe3037532be611fc2d4b5f5b14c72b23f43a25fbd254cf009256a',
  );
  assert.equal(
    sha256Hex(canonicalBytes(candidate)),
    'f2450c2d1881ec027ab36834caeb8f2299dcd3b667be012d6e3c2856197ad8a0',
  );
  const inverse = structuredClone(candidate);
  for (const [id, pattern] of [
    ['lint:families', 'database/migrations/'],
    ['test:unit', 'database/'],
    ['db:rls', 'database/'],
  ]) {
    assert.equal(task(inverse, id).inputSelectors.length - task(control, id).inputSelectors.length, 1);
    assert.deepEqual(task(inverse, id).inputSelectors.pop(), { kind: 'prefix', pattern });
  }
  assert.deepEqual(inverse, control);
});

test('actual guard admits only exact reviewed transition and writes candidate descriptor', (t) => {
  const result = invoke(fixture(t));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'path=candidate/test-tasks.json\n');
});

test('canonical equality retains protected control selection despite JSON whitespace/key order', (t) => {
  const root = fixture(t);
  write(
    root,
    'candidate',
    JSON.stringify(Object.fromEntries(Object.entries(control).reverse()), null, 3),
  );
  const result = invoke(root);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, 'path=control/test-tasks.json\n');
});

const mutations = [
  ['missing migration lint selector', (d) => task(d, 'lint:families').inputSelectors.pop()],
  ['changed migration prefix', (d) => { task(d, 'lint:families').inputSelectors.at(-1).pattern = 'database/'; }],
  ['changed selector kind', (d) => { task(d, 'test:unit').inputSelectors.at(-1).kind = 'exact'; }],
  ['missing unit selector', (d) => task(d, 'test:unit').inputSelectors.pop()],
  [
    'duplicate unit selector',
    (d) => task(d, 'test:unit').inputSelectors.push(task(d, 'test:unit').inputSelectors.at(-1)),
  ],
  [
    'extra selector',
    (d) => task(d, 'db:rls').inputSelectors.push({ kind: 'exact', pattern: 'unreviewed' }),
  ],
  ['reordered selectors', (d) => task(d, 'test:unit').inputSelectors.reverse()],
  ['missing RLS selector', (d) => task(d, 'db:rls').inputSelectors.pop()],
  [
    'altered command',
    (d) => {
      task(d, 'test:unit').argv = ['true'];
    },
  ],
  [
    'altered toolchain',
    (d) => {
      task(d, 'test:unit').toolchainKeys.pop();
    },
  ],
  [
    'altered cwd',
    (d) => {
      task(d, 'test:unit').cwd = 'elsewhere';
    },
  ],
  [
    'altered runner',
    (d) => {
      task(d, 'test:unit').runner = 'unreviewed';
    },
  ],
  [
    'altered dependency',
    (d) => {
      task(d, 'test:unit').dependencies = [];
    },
  ],
  [
    'altered environment',
    (d) => {
      task(d, 'test:unit').allowlistedEnv.push('UNREVIEWED');
    },
  ],
  [
    'altered output',
    (d) => {
      task(d, 'test:unit').outputContract.requiredResult = 'skip';
    },
  ],
  [
    'altered profile',
    (d) => {
      d.profiles.find((p) => p.profileId === 'rc').requiredNodes = ['engines'];
    },
  ],
  ['added task', (d) => d.tasks.push({ ...d.tasks[0], nodeId: 'unexpected' })],
  ['removed task', (d) => d.tasks.pop()],
  [
    'duplicate task binding',
    (d) => {
      d.tasks[0] = structuredClone(task(d, 'test:unit'));
    },
  ],
  [
    'prototype-key data',
    (d) => Object.defineProperty(d, '__proto__', { value: { tasks: [] }, enumerable: true }),
  ],
];
for (const [name, mutate] of mutations) {
  test(`actual guard refuses ${name}`, (t) => {
    const root = fixture(t);
    const changed = structuredClone(candidate);
    mutate(changed);
    assert.notDeepEqual(changed, candidate, 'negative control must change actual input');
    write(root, 'candidate', changed);
    refuses(invoke(root), 'candidate-digest');
  });
}
for (const [name, value] of [
  ['malformed JSON', '{'],
  ['null JSON', 'null'],
  ['array shape', '[]'],
  ['numeric shape', '42'],
]) {
  test(`actual guard refuses ${name}`, (t) => {
    const root = fixture(t);
    write(root, 'candidate', value);
    refuses(invoke(root));
  });
}
test('actual guard refuses changed protected control descriptor', (t) => {
  const root = fixture(t);
  const changed = structuredClone(control);
  changed.tasks.pop();
  write(root, 'control', changed);
  refuses(invoke(root), 'control-digest');
});
for (const side of ['candidate', 'control']) {
  test(`actual Git ${side} ref drift is refused even with approved descriptor bytes`, (t) => {
    const root = fixture(t);
    git(join(root, side), 'update-ref', '--no-deref', 'HEAD', side === 'candidate' ? M : C);
    refuses(invoke(root), `${side}-identity`);
  });
}
test('candidate input SHA mismatch is refused before descriptor admission', (t) => {
  refuses(invoke(fixture(t), run, M), 'candidate-identity');
});
for (const [name, from, to] of [
  [
    'migration lint literal',
    "task('lint:families').inputSelectors.push({ kind: 'prefix', pattern: 'database/migrations/' });",
    "task('lint:families').inputSelectors.push({ kind: 'prefix', pattern: 'database/' });",
  ],
  [
    'unit literal',
    "task('test:unit').inputSelectors.push({ kind: 'prefix', pattern: 'database/' });",
    "task('test:unit').inputSelectors.push({ kind: 'prefix', pattern: 'other/' });",
  ],
  [
    'RLS literal',
    "task('db:rls').inputSelectors.push({ kind: 'prefix', pattern: 'database/' });",
    "task('db:rls').inputSelectors.push({ kind: 'prefix', pattern: 'other/' });",
  ],
]) {
  test(`counterfactual ${name} guard mutation is killed by actual reconstruction comparison`, (t) => {
    assert.equal(run.split(from).length, 2, 'mutation must match exactly one authored literal');
    refuses(invoke(fixture(t), run.replace(from, to)), 'unreviewed-delta');
  });
}

test('independent frozen commit and tree pins match the actual guard and Git objects', () => {
  assert.equal(git(repository, 'rev-parse', `${C}^{tree}`), candidateTree);
  assert.ok(run.includes(`const candidateCommit = '${C}';`));
  assert.ok(run.includes(`const candidateTree = '${candidateTree}';`));
  assert.ok(run.includes(`const controlCommit = '${M}';`));
});

test('counterfactual candidate tree mismatch refuses despite matching commit and descriptor', (t) => {
  const from = `const candidateTree = '${candidateTree}';`;
  assert.equal(run.split(from).length, 2);
  const wrongTree = '0'.repeat(40);
  assert.notEqual(candidateTree, wrongTree);
  refuses(invoke(fixture(t), run.replace(from, `const candidateTree = '${wrongTree}';`)), 'candidate-identity');
});
