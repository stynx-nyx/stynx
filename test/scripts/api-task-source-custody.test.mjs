import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '../..');
const helper = 'scripts/verify-public-api-declaration.mjs';
const builder = resolve(
  root,
  'node_modules/@aarusso-nyx/devai/dist/runtime/evidence-verification/src/build-policy-cli.js',
);
function run(cwd, command, args) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null);
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`,
  );
  return result.stdout.trim();
}
const git = (cwd, ...args) => run(cwd, 'git', args);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function policy(repo, output) {
  const commit = git(repo, 'rev-parse', 'HEAD');
  const tree = git(repo, 'rev-parse', 'HEAD^{tree}');
  const response = JSON.parse(
    run(repo, process.execPath, [
      builder,
      '--repo',
      repo,
      '--descriptor',
      join(repo, 'test-tasks.json'),
      '--profile',
      'rc',
      '--commit',
      commit,
      '--tree',
      tree,
      '--toolchain',
      join(repo, 'law/policy/devai-local-rc-toolchain.json'),
      '--environment',
      join(repo, 'law/policy/devai-local-rc-environment.json'),
      '--schema-version',
      '1.1.0',
      '--output',
      output,
    ]),
  );
  assert.equal(response.ok, true);
  assert.equal(response.candidateTree, tree);
  const document = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(document.requiredNodes.length, 15);
  assert.equal(new Set(document.requiredNodes.map((row) => row.nodeId)).size, 15);
  return {
    commit,
    tree,
    descriptorDigest: response.descriptorDigest,
    policyDigest: response.taskPolicyDigest,
    keys: Object.fromEntries(document.requiredNodes.map((row) => [row.nodeId, row.taskKey])),
  };
}
function commit(repo, path) {
  git(repo, 'add', '--', path);
  git(
    repo,
    '-c',
    'user.name=DEVAI Inspector',
    '-c',
    'user.email=devai-inspector@users.noreply.github.com',
    'commit',
    '-m',
    'test(stynx-workspace): witness isolated producer byte custody',
  );
}

// The published builder reads actual Git objects in a private clone. These
// diagnostic candidates prove source/key custody, not an executed RC or release.
test('published API task identity binds the genuine helper bytes without changing the protected descriptor', (t) => {
  assert.equal(
    JSON.parse(readFileSync(resolve(root, 'node_modules/@aarusso-nyx/devai/package.json'), 'utf8'))
      .version,
    '2.6.0',
  );
  const directory = mkdtempSync(join(tmpdir(), 'stynx api custody ação-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const repo = join(directory, 'candidate');
  git(directory, 'clone', '--shared', '--no-checkout', '--quiet', root, repo);
  git(repo, 'checkout', '--quiet', '--detach', git(root, 'rev-parse', 'HEAD'));
  assert.equal(existsSync(join(repo, helper)), true);
  assert.equal(existsSync(join(repo, 'scripts/lib/public-api-declaration.mjs')), false);
  const descriptor = readFileSync(join(repo, 'test-tasks.json'));
  const original = readFileSync(join(repo, helper));
  const before = policy(repo, join(directory, 'before.json'));
  const modified = Buffer.concat([
    original,
    Buffer.from('\n// Independent future producer-byte custody witness.\n'),
  ]);
  writeFileSync(join(repo, helper), modified);
  commit(repo, helper);
  assert.equal(git(repo, 'diff', '--name-only', before.commit, 'HEAD'), helper);
  const changed = policy(repo, join(directory, 'helper-change.json'));
  assert.notEqual(sha256(original), sha256(modified));
  assert.notEqual(before.tree, changed.tree);
  assert.equal(before.descriptorDigest, changed.descriptorDigest);
  assert.notEqual(before.keys['api:contracts'], changed.keys['api:contracts']);
  assert.notEqual(before.keys['release:prepare'], changed.keys['release:prepare']);
  for (const node of ['engines', 'typecheck', 'build'])
    assert.equal(before.keys[node], changed.keys[node], node);
  assert.deepEqual(readFileSync(join(repo, 'test-tasks.json')), descriptor);
  const unselected = 'scripts/lib/independent-unselected-custody-control.mjs';
  writeFileSync(join(repo, unselected), 'export const diagnosticControl = true;\n');
  commit(repo, unselected);
  assert.equal(git(repo, 'diff', '--name-only', changed.commit, 'HEAD'), unselected);
  const control = policy(repo, join(directory, 'unselected-control.json'));
  assert.notEqual(changed.tree, control.tree);
  assert.equal(changed.descriptorDigest, control.descriptorDigest);
  assert.equal(changed.keys['api:contracts'], control.keys['api:contracts']);
  assert.notEqual(changed.keys['release:prepare'], control.keys['release:prepare']);
  assert.deepEqual(readFileSync(join(repo, 'test-tasks.json')), descriptor);
  t.diagnostic(
    JSON.stringify({
      scope: 'published-policy-real-git-byte-custody-component',
      sourceCandidate: before.commit,
      sourceTree: before.tree,
      descriptorSha256: sha256(descriptor),
      descriptorDigest: before.descriptorDigest,
      helperPath: helper,
      beforeInputSha256: sha256(original),
      afterInputSha256: sha256(modified),
      apiKeyBefore: before.keys['api:contracts'],
      apiKeyChangedHelper: changed.keys['api:contracts'],
      apiKeyUnselectedControl: control.keys['api:contracts'],
      readinessPromoting: false,
    }),
  );
});
