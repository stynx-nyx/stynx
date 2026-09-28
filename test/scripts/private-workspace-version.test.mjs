import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

// INV-RELEASE: Changesets must not alter private workspace package roots.
const repoRoot = resolve(import.meta.dirname, '..', '..');
const helperPath = join(repoRoot, 'scripts/lib/private-workspace-version.mjs');
const wrapperPath = join(repoRoot, 'scripts/version-packages.mjs');

function put(root, path, bytes) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  return target;
}

function manifest(name, extra = {}) {
  return Buffer.from(`${JSON.stringify({ name, ...extra }, null, 2)}\n`);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'stynx-private-version-'));
  put(root, 'pnpm-workspace.yaml', [
    'packages:',
    "  - 'packages/*'",
    "  - 'packages-web/*'",
    "  - 'reference/*'",
    "  - 'domain/*/api'",
    "  - 'domain/*/web'",
    "  - 'tools/*'",
    "  - 'test/*'",
    "  - 'docs/site'",
    '',
  ].join('\n'));
  const originals = new Map([
    ['package.json', manifest('workspace-root', { private: true, version: '1.5.0-rc.3' })],
    ['tools/image-size-safe/package.json', Buffer.from('{ "name": "image-size-safe", "private": true, "version": "2.0.3-stynx.1" }\n')],
    ['tools/image-size-safe/CHANGELOG.md', Buffer.from('# image-size-safe\r\n\r\nold entry\r\n')],
    ['domain/orders/api/package.json', manifest('orders-api', { private: true, version: '0.7.1' })],
    ['docs/site/package.json', manifest('docs-site', { private: true, version: '1.0.0' })],
    ['docs/site/CHANGELOG.md', Buffer.from('# docs site\nOriginal non-ASCII: ação\n')],
    ['test/db/package.json', manifest('database-tests', { private: true })],
    ['packages/public/package.json', manifest('@stynx-nyx/public', { version: '1.5.0-rc.3' })],
    ['packages/public/CHANGELOG.md', Buffer.from('# public original\n')],
    ['node_modules/decoy/package.json', manifest('dependency-decoy', { private: true, version: '3.0.0' })],
    ['tools/image-size-safe/dist/package.json', manifest('build-decoy', { private: true, version: '4.0.0' })],
  ]);
  for (const [path, bytes] of originals) put(root, path, bytes);
  return { root, originals };
}

function mutateAsChangesets(root) {
  for (const path of [
    'tools/image-size-safe/package.json',
    'domain/orders/api/package.json',
    'docs/site/package.json',
    'test/db/package.json',
    'packages/public/package.json',
  ]) put(root, path, manifest(`changed-${path}`, { version: '1.5.0' }));
  for (const path of [
    'tools/image-size-safe/CHANGELOG.md',
    'domain/orders/api/CHANGELOG.md',
    'docs/site/CHANGELOG.md',
    'test/db/CHANGELOG.md',
    'packages/public/CHANGELOG.md',
  ]) put(root, path, '# generated\n');
}

async function helper() {
  return import(helperPath);
}

test('private snapshot restores exact bytes and absence across workspace globs while preserving public output', async () => {
  const { root, originals } = fixture();
  try {
    const { snapshotPrivateWorkspacePackages, restorePrivateWorkspacePackages } = await helper();
    const snapshot = snapshotPrivateWorkspacePackages(root);
    mutateAsChangesets(root);
    restorePrivateWorkspacePackages(snapshot);
    for (const path of [
      'package.json',
      'tools/image-size-safe/package.json',
      'tools/image-size-safe/CHANGELOG.md',
      'domain/orders/api/package.json',
      'docs/site/package.json',
      'docs/site/CHANGELOG.md',
      'test/db/package.json',
      'node_modules/decoy/package.json',
      'tools/image-size-safe/dist/package.json',
    ]) assert.deepEqual(readFileSync(join(root, path)), originals.get(path), path);
    for (const path of ['domain/orders/api/CHANGELOG.md', 'test/db/CHANGELOG.md']) {
      assert.equal(existsSync(join(root, path)), false, path);
    }
    assert.deepEqual(readFileSync(join(root, 'packages/public/package.json')),
      manifest('changed-packages/public/package.json', { version: '1.5.0' }));
    assert.equal(readFileSync(join(root, 'packages/public/CHANGELOG.md'), 'utf8'), '# generated\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('private discovery fails closed on missing or malformed workspace manifest', async () => {
  const { snapshotPrivateWorkspacePackages } = await helper();
  for (const caseName of ['missing', 'malformed']) {
    const { root } = fixture();
    try {
      const path = join(root, 'domain/orders/api/package.json');
      if (caseName === 'missing') rmSync(path);
      else writeFileSync(path, '{ broken');
      assert.throws(() => snapshotPrivateWorkspacePackages(root), /domain\/orders\/api\/package\.json|manifest|JSON/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('snapshot can restore after Changesets fails midway', async () => {
  const { root, originals } = fixture();
  try {
    const { snapshotPrivateWorkspacePackages, restorePrivateWorkspacePackages } = await helper();
    const snapshot = snapshotPrivateWorkspacePackages(root);
    try {
      mutateAsChangesets(root);
      throw new Error('synthetic Changesets failure');
    } catch (error) {
      assert.match(error.message, /synthetic Changesets failure/u);
    } finally {
      restorePrivateWorkspacePackages(snapshot);
    }
    assert.deepEqual(readFileSync(join(root, 'tools/image-size-safe/package.json')),
      originals.get('tools/image-size-safe/package.json'));
    assert.equal(existsSync(join(root, 'domain/orders/api/CHANGELOG.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('wrapper captures before direct Changesets spawn and restores in finally before every downstream action', () => {
  const source = readFileSync(wrapperPath, 'utf8');
  assert.doesNotMatch(source, /run\(\s*['"]pnpm['"]\s*,\s*\[\s*['"]exec['"]\s*,\s*['"]changeset['"]\s*,\s*['"]version['"]\s*\]\s*\)/u);
  const capture = source.indexOf('snapshotPrivateWorkspacePackages(');
  const spawn = source.search(/spawnSync\(\s*['"]pnpm['"]\s*,\s*\[\s*['"]exec['"]\s*,\s*['"]changeset['"]\s*,\s*['"]version['"]\s*\]/u);
  const finallyAt = source.indexOf('finally', spawn);
  const restore = source.indexOf('restorePrivateWorkspacePackages(', finallyAt);
  const generated = source.indexOf('validateGeneratedVersionTransition(', spawn);
  const fixed = source.indexOf('applyFixedGroupVersion(', spawn);
  const sync = source.indexOf('syncReleaseVersion(', spawn);
  const sbom = source.indexOf("run('pnpm', ['security:sbom'])", spawn);
  for (const [label, at] of [['capture', capture], ['spawn', spawn], ['finally', finallyAt], ['restore', restore], ['validation', generated], ['fixed group', fixed], ['sync', sync], ['SBOM', sbom]]) {
    assert.ok(at >= 0, `${label} must be present`);
  }
  assert.ok(capture < spawn && spawn < finallyAt && finallyAt < restore, 'snapshot and finally order');
  assert.ok(restore < Math.min(generated, fixed, sync, sbom), 'restore must precede all generated work');
  assert.match(source.slice(restore, generated), /(?:\.error|\.status|status\s*\?\?\s*1)/u,
    'Changesets result must be checked only after restoration');
});

function wrapperHarness() {
  const { root, originals } = fixture();
  put(root, '.changeset/config.json', '{}\n');
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  symlinkSync(join(repoRoot, 'node_modules/yaml'), join(root, 'node_modules/yaml'));
  assert.ok(existsSync(helperPath), 'private snapshot helper must exist');
  copyFileSync(helperPath, join(root, 'scripts/lib/private-workspace-version.mjs'));
  let source = readFileSync(wrapperPath, 'utf8');
  source = source.replace("from 'node:child_process'", "from './spawn-stub.mjs'");
  put(root, 'scripts/version-packages.mjs', source);
  put(root, 'scripts/lib/fixed-group-version.mjs', `
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
function check(root, phase) {
  const body = readFileSync(resolve(root, 'tools/image-size-safe/package.json'), 'utf8');
  if (!body.includes('2.0.3-stynx.1')) throw new Error(phase + ' saw unrestored private manifest');
  appendFileSync(resolve(root, 'phases'), phase + '\\n');
}
export const planFixedGroupVersion = () => ({ changesets: [{file:'test.md', types:['patch']}], current:'1.5.0-rc.3', expected:'1.5.0', bump:'patch', preState:{}, pendingIds:[] });
export const readPreState = () => null;
export const unifiedVersion = root => { check(root, 'generated'); return '1.5.0-rc.3'; };
export const validateGeneratedVersionTransition = ({}) => {};
export const applyFixedGroupVersion = root => { check(root, 'fixed'); return { manifests:0, changelogs:0 }; };
`);
  put(root, 'scripts/lib/release-version-policy.mjs', `
import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
function check(root, phase) {
  if (!readFileSync(resolve(root, 'tools/image-size-safe/package.json'), 'utf8').includes('2.0.3-stynx.1')) throw new Error(phase + ' saw unrestored private manifest');
  appendFileSync(resolve(root, 'phases'), phase + '\\n');
}
export const syncReleaseVersion = root => { check(root, 'sync'); return {packageCount:1, version:'1.5.0'}; };
export const validateReleaseVersionPolicy = root => { check(root, 'policy'); return []; };
`);
  put(root, 'scripts/spawn-stub.mjs', `
import { appendFileSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
export function spawnSync(command, args, options) {
  const root = options.cwd;
  if (args.join(' ') === 'exec changeset version') {
    appendFileSync(resolve(root, 'phases'), 'spawn\\n');
    writeFileSync(resolve(root, 'tools/image-size-safe/package.json'), '{"private":true,"version":"2.0.3"}\\n');
    writeFileSync(resolve(root, 'tools/image-size-safe/CHANGELOG.md'), '# changed\\n');
    writeFileSync(resolve(root, 'domain/orders/api/CHANGELOG.md'), '# new\\n');
    writeFileSync(resolve(root, 'packages/public/CHANGELOG.md'), '# public changed\\n');
    if (process.env.RESTORE_ERROR === '1') {
      rmSync(resolve(root, 'tools/image-size-safe/package.json'));
      mkdirSync(resolve(root, 'tools/image-size-safe/package.json'));
      rmSync(resolve(root, 'tools/image-size-safe/CHANGELOG.md'));
      mkdirSync(resolve(root, 'tools/image-size-safe/CHANGELOG.md'));
    }
    if (process.env.SPAWN_CASE === 'null') return {status:null, signal:'SIGTERM'};
    if (process.env.SPAWN_CASE === 'error') return {status:null, error:new Error('synthetic spawn error')};
    if (process.env.SPAWN_CASE === 'nonzero') return {status:7};
    return {status:0};
  }
  if (args.join(' ') === 'security:sbom') {
    if (!readFileSync(resolve(root, 'tools/image-size-safe/package.json'), 'utf8').includes('2.0.3-stynx.1')) throw new Error('SBOM saw unrestored private manifest');
    appendFileSync(resolve(root, 'phases'), 'sbom\\n');
    return {status:0};
  }
  throw new Error('unexpected subprocess: ' + command + ' ' + args.join(' '));
}
`);
  return { root, originals };
}

test('wrapper restores on success, nonzero, null status, and spawn error before propagation', () => {
  for (const mode of ['success', 'nonzero', 'null', 'error']) {
    const { root, originals } = wrapperHarness();
    try {
      const result = spawnSync(process.execPath, ['scripts/version-packages.mjs'], {
        cwd: root,
        env: { ...process.env, SPAWN_CASE: mode },
        encoding: 'utf8',
      });
      assert.equal(result.error, undefined, mode);
      assert.equal(result.status, mode === 'success' ? 0 : mode === 'nonzero' ? 7 : 1, `${mode}: ${result.stderr}`);
      assert.deepEqual(readFileSync(join(root, 'tools/image-size-safe/package.json')),
        originals.get('tools/image-size-safe/package.json'), mode);
      assert.deepEqual(readFileSync(join(root, 'tools/image-size-safe/CHANGELOG.md')),
        originals.get('tools/image-size-safe/CHANGELOG.md'), mode);
      assert.equal(existsSync(join(root, 'domain/orders/api/CHANGELOG.md')), false, mode);
      assert.equal(readFileSync(join(root, 'packages/public/CHANGELOG.md'), 'utf8'), '# public changed\n');
      const phases = readFileSync(join(root, 'phases'), 'utf8').trim().split('\n');
      assert.equal(phases[0], 'spawn');
      if (mode === 'success') assert.deepEqual(phases, ['spawn', 'generated', 'fixed', 'sync', 'policy', 'sbom']);
      else assert.deepEqual(phases, ['spawn'], mode);
      if (mode === 'error') assert.match(result.stderr, /synthetic spawn error/u);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test('wrapper reports original Changesets failure and every restoration error', () => {
  const { root } = wrapperHarness();
  try {
    const result = spawnSync(process.execPath, ['scripts/version-packages.mjs'], {
      cwd: root,
      env: { ...process.env, SPAWN_CASE: 'nonzero', RESTORE_ERROR: '1' },
      encoding: 'utf8',
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /changeset|Changesets/u);
    assert.match(result.stderr, /(?:status|exit)[^\n]*7|7[^\n]*(?:status|exit)/u);
    assert.match(result.stderr, /tools\/image-size-safe\/package\.json/u);
    assert.match(result.stderr, /tools\/image-size-safe\/CHANGELOG\.md/u);
    assert.deepEqual(readFileSync(join(root, 'phases'), 'utf8').trim().split('\n'), ['spawn']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
