import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import test from 'node:test';
import {
  assertHttpBuildRosterUnchanged,
  snapshotHttpDependencyBytes,
  snapshotHttpTrackedInputs,
} from '../../scripts/lib/http-build-roster.mjs';

// ADR-PERF-0001: actual Git objects and private pnpm installation, no successful-build claim.
const pnpm = join(dirname(process.execPath), 'pnpm');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t, installed = false) {
  assert.equal(process.versions.node, '24.20.0');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx roster espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const environment = {
    ...process.env,
    HOME: root,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_TERMINAL_PROMPT: '0',
  };
  const git = (...args) =>
    execFileSync('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', '-C', root, ...args], {
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const write = (path, bytes) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), bytes);
  };
  const json = (path, value) => write(path, `${JSON.stringify(value, null, 2)}\n`);
  const commit = () => {
    git('add', '-A');
    git(
      '-c',
      'user.name=Inspector Fixture',
      '-c',
      'user.email=fixture@example.invalid',
      'commit',
      '-qm',
      'fixture',
    );
    return git('rev-parse', 'HEAD');
  };
  git('init', '-q');
  write('.gitignore', 'node_modules/\n');
  write('source espaço 日本語.ts', 'export const value = 1;\n');
  write('runner.sh', '#!/bin/sh\nexit 0\n');
  chmodSync(join(root, 'runner.sh'), 0o755);
  json('package.json', {
    private: true,
    packageManager: 'pnpm@9.15.0',
    ...(installed
      ? {
          devDependencies: {
            'fixture-vendor': 'file:fixtures/fixture-vendor-1.0.0.tgz',
            '@stynx-nyx/auth': 'workspace:*',
          },
        }
      : {}),
  });
  write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n  - 'reference/api'\n");
  json('packages/auth/package.json', {
    name: '@stynx-nyx/auth',
    version: '1.0.0',
    private: true,
    scripts: { build: 'tsc -p tsconfig.json' },
  });
  json('packages/auth/tsconfig.json', { compilerOptions: { outDir: 'dist' } });
  json('reference/api/package.json', {
    name: '@stynx-nyx/reference-api',
    version: '1.0.0',
    private: true,
    scripts: {
      build: 'node ../../scripts/verify-reference-api-build-inputs.mjs && tsc -p tsconfig.json',
    },
    dependencies: { '@stynx-nyx/auth': 'workspace:*' },
  });
  json('reference/api/tsconfig.json', { compilerOptions: { outDir: 'dist' } });
  if (installed) {
    json('fixtures/vendor/package.json', {
      name: 'fixture-vendor',
      version: '1.0.0',
      main: 'index.cjs',
    });
    write('fixtures/vendor/index.cjs', 'module.exports = { value: 7 };\n');
    write('fixtures/vendor/data.json', '{"value":7}\n');
    execFileSync(pnpm, ['pack', '--pack-destination', join(root, 'fixtures')], {
      cwd: join(root, 'fixtures/vendor'),
      env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30000,
    });
    execFileSync(
      pnpm,
      [
        'install',
        '--offline',
        '--ignore-scripts',
        '--config.package-import-method=copy',
        '--store-dir',
        join(root, '.fixture-store'),
      ],
      {
        cwd: root,
        env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', CI: 'true' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30000,
      },
    );
    write('.gitignore', 'node_modules/\n.fixture-store/\n');
  }
  const head = commit();
  return {
    root,
    head,
    git,
    write,
    json,
    commit,
    tracked: (sha = head) => snapshotHttpTrackedInputs(root, sha),
    dependencies: () => snapshotHttpDependencyBytes(root),
  };
}
function refusal(action, message) {
  assert.throws(action, (error) => {
    assert.equal(error.code, 'HTTP_BUILD_ROSTER_INVALID');
    assert.match(error.message, message);
    return true;
  });
}

test('real immutable Git roster retains exact Unicode bytes, tree, modes and private frozen identity', (t) => {
  const f = fixture(t);
  const before = f.tracked();
  assert.equal(before.candidateCommit, f.head);
  assert.equal(before.tree, f.git('rev-parse', `${f.head}^{tree}`));
  const source = before.files.find((row) => row.path === 'source espaço 日本語.ts');
  assert.equal(source.sha256, digest(readFileSync(join(f.root, source.path))));
  assert.equal(source.mode, '100644');
  assert.equal(before.files.find((row) => row.path === 'runner.sh').mode, '100755');
  assertHttpBuildRosterUnchanged(before, f.tracked());
  assert.equal(Object.isFrozen(before), true);
  assert.equal(Object.isFrozen(before.files), true);
  assert.equal(before.files.every(Object.isFrozen), true);
  assert.throws(() => {
    before.files[0].sha256 = '0'.repeat(64);
  }, TypeError);
  assert.equal(Object.hasOwn(before, 'readinessPromoting'), false);
});

for (const [label, mutate, message] of [
  [
    'dirty bytes',
    (f) => f.write('source espaço 日本語.ts', 'export const value = 2;\n'),
    /checkout bytes/u,
  ],
  [
    'staged bytes',
    (f) => {
      f.write('source espaço 日本語.ts', 'export const value = 2;\n');
      f.git('add', 'source espaço 日本語.ts');
    },
    /index does not match/u,
  ],
  [
    'added tracked member',
    (f) => {
      f.write('new.ts', 'export const value = 3;\n');
      f.git('add', 'new.ts');
    },
    /index roster/u,
  ],
  ['removed tracked member', (f) => f.git('rm', 'source espaço 日本語.ts'), /index roster/u],
  [
    'index executable drift',
    (f) => f.git('update-index', '--chmod=+x', 'source espaço 日本語.ts'),
    /index does not match/u,
  ],
  ['owner execute removed', (f) => chmodSync(join(f.root, 'runner.sh'), 0o655), /executable mode/u],
  [
    'owner execute added',
    (f) => chmodSync(join(f.root, 'source espaço 日本語.ts'), 0o744),
    /executable mode/u,
  ],
])
  test(`actual tracked roster refuses ${label}`, (t) => {
    const f = fixture(t);
    mutate(f);
    refusal(() => f.tracked(), message);
  });

test('full tracked permissions participate in comparison even when Git executable mode is unchanged', (t) => {
  const f = fixture(t);
  const before = f.tracked();
  chmodSync(join(f.root, 'source espaço 日本語.ts'), 0o640);
  const after = f.tracked();
  assert.equal(
    after.files.find((row) => row.path === 'source espaço 日本語.ts').permissions,
    0o640,
  );
  refusal(() => assertHttpBuildRosterUnchanged(before, after), /roster changed/u);
});

test('candidate identity is exact and a later actual HEAD refuses the earlier candidate', (t) => {
  const f = fixture(t);
  refusal(() => f.tracked(f.head.slice(0, 8)), /full immutable SHA/u);
  f.write('new.ts', 'export const value = 3;\n');
  f.commit();
  refusal(() => f.tracked(), /candidate changed/u);
});

for (const mode of ['symlink', 'submodule', 'case collision', 'backslash path'])
  test(`real Git candidate refuses ${mode}`, (t) => {
    const f = fixture(t);
    if (mode === 'symlink') symlinkSync('runner.sh', join(f.root, 'linked.sh'));
    if (mode === 'submodule')
      f.git('update-index', '--add', '--cacheinfo', `160000,${f.head},nested`);
    if (mode === 'case collision') {
      const blob = f.git('rev-parse', `${f.head}:runner.sh`);
      f.git('update-index', '--add', '--cacheinfo', `100644,${blob},Case.ts`);
      f.git('update-index', '--add', '--cacheinfo', `100644,${blob},case.ts`);
    }
    if (mode === 'backslash path') f.write('literal\\path.ts', 'export const value = 3;\n');
    // Preserve synthetic index entries without git add attempting to materialize them.
    if (mode === 'submodule' || mode === 'case collision')
      f.git(
        '-c',
        'user.name=Inspector Fixture',
        '-c',
        'user.email=fixture@example.invalid',
        'commit',
        '-qm',
        'unsupported actual index',
      );
    else f.commit();
    refusal(
      () => snapshotHttpTrackedInputs(f.root, f.git('rev-parse', 'HEAD')),
      /mode|submodule|symlink|case-colliding|Unsupported Git path/u,
    );
  });

test('actual unmerged index stages refuse before a tracked snapshot is returned', (t) => {
  const f = fixture(t);
  const path = 'source espaço 日本語.ts';
  const blob = f.git('rev-parse', `${f.head}:${path}`);
  f.git('update-index', '--force-remove', path);
  execFileSync('/usr/bin/git', ['-C', f.root, 'update-index', '--index-info'], {
    input: [1, 2, 3].map((stage) => `100644 ${blob} ${stage}\t${path}\n`).join(''),
  });
  refusal(() => f.tracked(), /Unmerged|unsupported build index/u);
});

test('linked tracked ancestor refuses even when the relocated file bytes still match', (t) => {
  const f = fixture(t);
  f.write('nested/input.ts', 'export const nested = 1;\n');
  const head = f.commit();
  const bytes = readFileSync(join(f.root, 'nested/input.ts'));
  rmSync(join(f.root, 'nested'), { recursive: true });
  f.write('relocated/input.ts', bytes);
  symlinkSync('relocated', join(f.root, 'nested'), 'dir');
  refusal(() => snapshotHttpTrackedInputs(f.root, head), /unlinked owned regular file/u);
});

test('actual replacement refs cannot substitute a different tree for the bound candidate', (t) => {
  const f = fixture(t);
  const before = f.tracked();
  f.write('source espaço 日本語.ts', 'export const value = 2;\n');
  const replacement = f.commit();
  f.git('reset', '--hard', f.head);
  f.git('replace', f.head, replacement);
  assert.notEqual(f.git('rev-parse', `${f.head}^{tree}`), before.tree);
  assertHttpBuildRosterUnchanged(before, f.tracked());
});

test('configured fsmonitor is not executed by the read-only Git snapshot', (t) => {
  const f = fixture(t);
  const witness = join(f.root, 'fsmonitor-ran');
  f.write('fsmonitor.sh', `#!/bin/sh\ntouch '${witness}'\n`);
  chmodSync(join(f.root, 'fsmonitor.sh'), 0o755);
  f.git('config', 'core.fsmonitor', join(f.root, 'fsmonitor.sh'));
  f.tracked();
  assert.equal(existsSync(witness), false);
});

test('promisor missing-tree refusal does not invoke lazy remote upload-pack', (t) => {
  const f = fixture(t);
  const remote = join(f.root, '.owned-remote.git');
  f.git('clone', '--bare', f.root, remote);
  const tree = f.git('rev-parse', `${f.head}^{tree}`);
  const witness = join(f.root, 'upload-pack-ran');
  f.write('upload-pack.sh', `#!/bin/sh\ntouch '${witness}'\nexec /usr/bin/git-upload-pack "$@"\n`);
  chmodSync(join(f.root, 'upload-pack.sh'), 0o755);
  f.git('config', 'remote.origin.url', remote);
  f.git('config', 'remote.origin.promisor', 'true');
  f.git('config', 'remote.origin.uploadpack', `'${join(f.root, 'upload-pack.sh')}'`);
  f.git('config', 'extensions.partialClone', 'origin');
  rmSync(join(f.root, '.git/objects', tree.slice(0, 2), tree.slice(2)));
  assert.throws(() => f.tracked());
  assert.equal(existsSync(witness), false);
  // Genuine control: ordinary Git performs the configured lazy fetch when it is allowed.
  assert.equal(f.git('cat-file', '-t', tree), 'tree');
  assert.equal(existsSync(witness), true);
});

test('serialized, cloned, proxied and toJSON-forged reports cannot become privately held snapshots', (t) => {
  const f = fixture(t);
  const before = f.tracked();
  for (const forged of [JSON.parse(JSON.stringify(before)), structuredClone(before), { ...before }])
    refusal(() => assertHttpBuildRosterUnchanged(before, forged), /privately held/u);
  let invoked = false;
  const forged = {
    toJSON() {
      invoked = true;
      return before;
    },
  };
  refusal(() => assertHttpBuildRosterUnchanged(before, forged), /privately held/u);
  const proxy = new Proxy(before, {
    get() {
      invoked = true;
      throw new Error('caller trap');
    },
  });
  refusal(() => assertHttpBuildRosterUnchanged(before, proxy), /privately held/u);
  assert.equal(invoked, false);
});

test('actual offline pnpm installation binds physical vendor data and exact workspace links separately', (t) => {
  const f = fixture(t, true);
  const before = f.dependencies();
  assertHttpBuildRosterUnchanged(before, f.dependencies());
  assert.equal(before.workspaceLinksRequireOutputCustody, true);
  assert.equal(before.candidateCommit, f.head);
  const vendor = before.files.find((row) => row.path === 'node_modules/fixture-vendor');
  assert.equal(vendor.kind, 'link');
  assert.equal(
    before.files.some(
      (row) => row.path === `${vendor.canonicalTarget}/data.json` && row.kind === 'file',
    ),
    true,
  );
  const workspace = before.files.find(
    (row) => row.path === 'reference/api/node_modules/@stynx-nyx/auth',
  );
  assert.equal(workspace.kind, 'workspace-link');
  assert.equal(workspace.canonicalTarget, 'packages/auth');
  assert.equal(
    workspace.manifestSha256,
    digest(readFileSync(join(f.root, 'packages/auth/package.json'))),
  );
});

for (const [label, mutate] of [
  [
    'JavaScript bytes',
    (f, vendor) => writeFileSync(join(vendor, 'index.cjs'), 'module.exports={value:8};\n'),
  ],
  ['non-JavaScript data', (f, vendor) => writeFileSync(join(vendor, 'data.json'), '{"value":8}\n')],
  ['full file permissions', (f, vendor) => chmodSync(join(vendor, 'data.json'), 0o640)],
  ['directory permissions', (f, vendor) => chmodSync(vendor, 0o700)],
  ['new empty directory', (f, vendor) => mkdirSync(join(vendor, 'empty'))],
  ['removed member', (f, vendor) => rmSync(join(vendor, 'data.json'))],
])
  test(`private installed dependency comparison detects ${label}`, (t) => {
    const f = fixture(t, true);
    const before = f.dependencies();
    const vendor = realpathSync(join(f.root, 'node_modules/fixture-vendor'));
    mutate(f, vendor);
    refusal(() => assertHttpBuildRosterUnchanged(before, f.dependencies()), /roster changed/u);
  });

for (const target of ['in-checkout vendor', 'external directory', 'absolute physical directory'])
  test(`private dependency link refuses ${target}`, (t) => {
    const f = fixture(t, true);
    const link = join(f.root, 'node_modules/fixture-vendor');
    const actual = realpathSync(link);
    rmSync(link);
    let destination;
    if (target === 'in-checkout vendor') destination = '../fixtures/vendor';
    if (target === 'absolute physical directory') destination = actual;
    if (target === 'external directory') {
      const external = realpathSync(mkdtempSync(join(tmpdir(), 'stynx external dependency ')));
      t.after(() => rmSync(external, { recursive: true, force: true }));
      destination = relative(dirname(link), external);
    }
    symlinkSync(destination, link, 'dir');
    refusal(() => f.dependencies(), /target|escapes/u);
  });

test('private installation cannot be an external directory symlink', (t) => {
  const f = fixture(t, true);
  const owned = join(f.root, 'node_modules');
  const external = realpathSync(mkdtempSync(join(tmpdir(), 'stynx external installation ')));
  t.after(() => rmSync(external, { recursive: true, force: true }));
  rmSync(owned, { recursive: true });
  symlinkSync(external, owned, 'dir');
  refusal(() => f.dependencies(), /owned unlinked directory/u);
});

test('untracked workspace manifest cannot masquerade as a candidate-bound dependency target', (t) => {
  const f = fixture(t, true);
  f.json('packages/untracked/package.json', { name: '@stynx-nyx/untracked', private: true });
  refusal(() => f.dependencies(), /not a candidate-bound input/u);
});
