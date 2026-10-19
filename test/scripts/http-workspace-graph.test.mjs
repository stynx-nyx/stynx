import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import {
  deriveHttpWorkspaceGraph,
  reconcileHttpWorkspaceSelector,
} from '../../scripts/lib/http-workspace-graph.mjs';

// Manifest and actual pnpm selection only: no install, build or freshness claim.
const repo = resolve(import.meta.dirname, '../..');
const pnpm = join(dirname(process.execPath), 'pnpm');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const referenceBuild =
  'node ../../scripts/verify-reference-api-build-inputs.mjs && tsc -p tsconfig.json';
const ordinaryBuild = 'tsc -p tsconfig.json';
const coreBuild = 'tsc -p tsconfig.json && pnpm run @stynx:emit-openapi';

function fixture(t) {
  assert.equal(process.versions.node, '24.20.0');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx workspace espaço 日本語 ')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, value);
  };
  const json = (name, value) => write(name, `${JSON.stringify(value, null, 2)}\n`);
  const read = (name) => JSON.parse(readFileSync(join(root, name), 'utf8'));
  const update = (name, mutation) => {
    const value = read(name);
    mutation(value);
    json(name, value);
  };
  const add = (short, extras = {}) => {
    const memberRoot = short === 'reference-api' ? 'reference/api' : `packages/${short}`;
    json(`${memberRoot}/package.json`, {
      name: `@stynx-nyx/${short}`,
      version: '1.0.0',
      private: true,
      scripts: { build: short === 'reference-api' ? referenceBuild : ordinaryBuild },
      ...extras,
    });
    json(`${memberRoot}/tsconfig.json`, { compilerOptions: { outDir: 'dist' } });
    json(`${memberRoot}/tsconfig.build.json`, { extends: './tsconfig.json' });
  };
  json('package.json', { private: true, packageManager: 'pnpm@9.15.0' });
  write('pnpm-workspace.yaml', "packages:\n  - 'packages/*'\n  - 'reference/api'\n");
  add('contracts');
  add('core', {
    scripts: { build: coreBuild, '@stynx:emit-openapi': 'node ./scripts/emit-openapi.mjs' },
    dependencies: { '@stynx-nyx/contracts': 'workspace:*' },
  });
  mkdirSync(join(root, 'packages/core/scripts'), { recursive: true });
  cpSync(
    join(repo, 'packages/core/scripts/emit-openapi.mjs'),
    join(root, 'packages/core/scripts/emit-openapi.mjs'),
  );
  add('data', { peerDependencies: { '@stynx-nyx/contracts': 'workspace:*' } });
  add('sessions', {
    dependencies: { '@stynx-nyx/core': 'workspace:*', '@stynx-nyx/data': 'workspace:*' },
  });
  add('storage', { dependencies: { '@stynx-nyx/core': 'workspace:*' } });
  add('testing', { dependencies: { '@stynx-nyx/storage': 'workspace:*' } });
  add('auth', {
    dependencies: { '@stynx-nyx/sessions': 'workspace:*' },
    devDependencies: { '@stynx-nyx/testing': 'workspace:*' },
  });
  add('logging');
  add('health', { peerDependencies: { '@stynx-nyx/logging': 'workspace:*' } });
  add('reference-api', {
    dependencies: { '@stynx-nyx/auth': 'workspace:*' },
    optionalDependencies: { '@stynx-nyx/health': 'workspace:*' },
  });
  return {
    root,
    write,
    json,
    read,
    update,
    add,
    graph: () => deriveHttpWorkspaceGraph(root),
    reconcile: (output) => reconcileHttpWorkspaceSelector(root, output),
  };
}

function actualSelector(root) {
  const result = spawnSync(
    pnpm,
    ['--filter', '@stynx-nyx/reference-api...', 'list', '--depth', '-1', '--json'],
    {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dirname(process.execPath)}:${process.env.PATH}`,
        NODE_OPTIONS: '',
        NODE_PATH: '',
      },
    },
  );
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(Array.isArray(JSON.parse(result.stdout)), true);
  return result.stdout;
}

function refusal(action, message) {
  assert.throws(action, (error) => {
    assert.equal(error.code, 'HTTP_WORKSPACE_GRAPH_INVALID');
    assert.match(error.message, message);
    return true;
  });
}

function rows(f) {
  return f
    .graph()
    .selected.map((member) => ({ name: member.name, path: join(f.root, member.root) }));
}

test('actual pinned pnpm selector agrees with all four dependency kinds and transitive testing/storage', (t) => {
  const f = fixture(t);
  const graph = f.reconcile(actualSelector(f.root));
  assert.deepEqual(
    graph.selected.map((member) => member.name).sort(),
    [
      'auth',
      'contracts',
      'core',
      'data',
      'health',
      'logging',
      'reference-api',
      'sessions',
      'storage',
      'testing',
    ]
      .map((name) => `@stynx-nyx/${name}`)
      .sort(),
  );
  const position = new Map(graph.topologicalScriptOrder.map((name, index) => [name, index]));
  for (const member of graph.selected)
    for (const dependency of member.dependencyNames)
      assert.equal(
        position.get(dependency) < position.get(member.name),
        true,
        `${dependency} must precede ${member.name}`,
      );
  assert.equal(graph.selected.at(-1).name, '@stynx-nyx/reference-api');
  assert.equal(
    graph.selected
      .find((member) => member.name === '@stynx-nyx/auth')
      .dependencyNames.includes('@stynx-nyx/testing'),
    true,
  );
  assert.equal(
    graph.selected
      .find((member) => member.name === '@stynx-nyx/testing')
      .dependencyNames.includes('@stynx-nyx/storage'),
    true,
  );
  assert.equal(graph.readinessPromoting, false);
  assert.equal(Object.hasOwn(graph, 'fresh'), false);
});

test('actual candidate recursive selector includes testing and matches independently discovered manifests', () => {
  const graph = reconcileHttpWorkspaceSelector(repo, actualSelector(repo));
  assert.equal(
    graph.selected.some((member) => member.name === '@stynx-nyx/testing'),
    true,
  );
  assert.equal(
    graph.selected.some((member) => member.name === '@stynx-nyx/reference-api'),
    true,
  );
  assert.equal(
    graph.selected.every(
      (member) =>
        member.manifestSha256 === hash(readFileSync(join(repo, member.root, 'package.json'))),
    ),
    true,
  );
});

test('core nested generator is recorded exactly and copied from the actual repository', (t) => {
  const f = fixture(t);
  const core = f.graph().selected.find((member) => member.root === 'packages/core');
  assert.equal(core.buildScript, coreBuild);
  assert.deepEqual(core.nestedScripts, {
    '@stynx:emit-openapi': 'node ./scripts/emit-openapi.mjs',
  });
  assert.equal(
    hash(readFileSync(join(f.root, 'packages/core/scripts/emit-openapi.mjs'))),
    hash(readFileSync(join(repo, 'packages/core/scripts/emit-openapi.mjs'))),
  );
});

test('a genuinely new dependency is added without a hardcoded closure cap and invalidates stale selectors', (t) => {
  const f = fixture(t);
  const stale = actualSelector(f.root);
  f.add('new-member');
  f.update('packages/testing/package.json', (value) => {
    value.devDependencies = { '@stynx-nyx/new-member': 'workspace:*' };
  });
  refusal(() => f.reconcile(stale), /omits/u);
  const updated = f.reconcile(actualSelector(f.root));
  assert.equal(
    updated.selected.some((member) => member.name === '@stynx-nyx/new-member'),
    true,
  );
});

test('removing testing from an actual selector cannot trim a required devDependency', (t) => {
  const f = fixture(t);
  const selected = JSON.parse(actualSelector(f.root)).filter(
    (row) => row.name !== '@stynx-nyx/testing',
  );
  refusal(() => f.reconcile(JSON.stringify(selected)), /omits/u);
});

test('actual pnpm includes dist workspaces while node_modules and bower_components remain ignored', (t) => {
  const f = fixture(t);
  for (const name of ['dist', 'node_modules', 'bower_components']) f.add(name);
  f.update('reference/api/package.json', (value) => {
    value.dependencies['@stynx-nyx/dist'] = 'workspace:*';
  });
  const graph = f.reconcile(actualSelector(f.root));
  assert.equal(
    graph.workspaces.some((member) => member.root === 'packages/dist'),
    true,
  );
  assert.equal(
    graph.workspaces.some((member) => member.root === 'packages/node_modules'),
    false,
  );
  assert.equal(
    graph.workspaces.some((member) => member.root === 'packages/bower_components'),
    false,
  );
});

for (const [script, config] of [
  ['tsc -p tsconfig.json', 'tsconfig.json'],
  ['rm -rf dist && tsc -p tsconfig.json', 'tsconfig.json'],
  ['rm -rf dist && tsc -p tsconfig.build.json', 'tsconfig.build.json'],
])
  test(`supported ordinary manifest command is preserved verbatim: ${script}`, (t) => {
    const f = fixture(t);
    f.update('packages/testing/package.json', (value) => {
      value.scripts.build = script;
    });
    const member = f.graph().selected.find((row) => row.name === '@stynx-nyx/testing');
    assert.equal(member.buildScript, script);
    assert.equal(member.compilerConfig, config);
  });

for (const [label, mutate, message] of [
  [
    'prebuild',
    (v) => {
      v.scripts.prebuild = 'node injected.mjs';
    },
    /lifecycle/u,
  ],
  [
    'postbuild',
    (v) => {
      v.scripts.postbuild = 'node injected.mjs';
    },
    /lifecycle/u,
  ],
  [
    'changed command',
    (v) => {
      v.scripts.build += ' --noCheck';
    },
    /build script/u,
  ],
  [
    'unknown command',
    (v) => {
      v.scripts.build = 'echo success';
    },
    /build script/u,
  ],
  [
    'missing build',
    (v) => {
      delete v.scripts.build;
    },
    /build script/u,
  ],
  [
    'generator outside core',
    (v) => {
      v.scripts.build = coreBuild;
    },
    /confined/u,
  ],
  [
    'verifier outside reference',
    (v) => {
      v.scripts.build = referenceBuild;
    },
    /confined/u,
  ],
])
  test(`selected package refuses ${label}`, (t) => {
    const f = fixture(t);
    f.update('packages/testing/package.json', mutate);
    refusal(() => f.graph(), message);
  });

for (const [label, mutate, message] of [
  [
    'omitted generator',
    (v) => {
      v.scripts.build = ordinaryBuild;
    },
    /omits/u,
  ],
  [
    'changed nested script',
    (v) => {
      v.scripts['@stynx:emit-openapi'] = 'node ./scripts/other.mjs';
    },
    /nested/u,
  ],
  [
    'pre-helper hook',
    (v) => {
      v.scripts['pre@stynx:emit-openapi'] = 'echo before';
    },
    /lifecycle/u,
  ],
  [
    'post-helper hook',
    (v) => {
      v.scripts['post@stynx:emit-openapi'] = 'echo after';
    },
    /lifecycle/u,
  ],
])
  test(`core refuses ${label}`, (t) => {
    const f = fixture(t);
    f.update('packages/core/package.json', mutate);
    refusal(() => f.graph(), message);
  });

test('reference cannot omit its actual input verifier', (t) => {
  const f = fixture(t);
  f.update('reference/api/package.json', (value) => {
    value.scripts.build = ordinaryBuild;
  });
  refusal(() => f.graph(), /omits/u);
});

for (const version of [
  'workspace:^',
  'workspace:../auth',
  '^1.0.0',
  'npm:@stynx-nyx/auth@1.0.0',
  'file:../auth',
  'link:../auth',
  '../auth',
])
  test(`local dependency refuses alias, range or precedence ${version}`, (t) => {
    const f = fixture(t);
    f.update('reference/api/package.json', (value) => {
      value.dependencies['@stynx-nyx/auth'] = version;
    });
    refusal(() => f.graph(), /Unsupported/u);
  });

test('actual pnpm population alone cannot qualify a file alias under an unrelated dependency key', (t) => {
  const f = fixture(t);
  f.update('packages/health/package.json', (value) => {
    value.dependencies = { 'aliased-auth': 'file:../auth' };
  });
  const actual = JSON.parse(actualSelector(f.root));
  assert.equal(
    actual.some((row) => row.name === '@stynx-nyx/auth'),
    true,
  );
  assert.equal(
    actual.some((row) => row.name === '@stynx-nyx/health'),
    true,
  );
  refusal(() => f.graph(), /alias|protocol|directory|dependency/u);
});

test('actual pnpm bare directory alias must refuse even when another edge masks its selected population', (t) => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'packages/health/subdir'));
  f.update('packages/health/package.json', (value) => {
    value.dependencies = { 'aliased-auth': 'subdir/../../auth' };
  });
  const masked = JSON.parse(actualSelector(f.root));
  assert.equal(
    masked.some((member) => member.name === '@stynx-nyx/auth'),
    true,
  );
  assert.equal(
    masked.some((member) => member.name === '@stynx-nyx/health'),
    true,
  );
  refusal(() => f.reconcile(JSON.stringify(masked)), /directory|alias/u);
  // Without the independent auth path, actual pnpm still follows the bare directory alias.
  f.update('reference/api/package.json', (value) => {
    value.dependencies = {};
  });
  const aliasOnly = JSON.parse(actualSelector(f.root));
  assert.equal(
    aliasOnly.some((member) => member.name === '@stynx-nyx/auth'),
    true,
  );
  refusal(() => f.reconcile(JSON.stringify(aliasOnly)), /directory|alias/u);
});

for (const alias of [
  'subdir/../../auth',
  'subdir\\..\\..\\auth',
  'portal:../auth',
  'patch:auth@1.0.0',
])
  test(`selected unrelated dependency key refuses concealed directory or alias ${alias}`, (t) => {
    const f = fixture(t);
    f.update('packages/health/package.json', (value) => {
      value.dependencies = { 'aliased-auth': alias };
    });
    refusal(() => f.graph(), /directory|alias/u);
  });

for (const alias of [
  '.',
  '..',
  '.hidden',
  'archive.tar',
  'archive.tgz',
  'archive.tar.gz',
  'archive.tarXgz',
])
  test(`selected unrelated dependency refuses unsupported file-spec syntax ${alias}`, (t) => {
    const f = fixture(t);
    f.update('packages/health/package.json', (value) => {
      value.dependencies = { 'aliased-auth': alias };
    });
    const coarse = actualSelector(f.root);
    assert.equal(
      JSON.parse(coarse).some((member) => member.name === '@stynx-nyx/health'),
      true,
    );
    // Selector population alone cannot authorize these unsupported dependency specifications.
    refusal(() => f.reconcile(coarse), /directory|alias/u);
  });

test('actual pinned pnpm tilde registry range remains external without concealing a workspace edge', (t) => {
  const f = fixture(t);
  f.update('packages/health/package.json', (value) => {
    value.dependencies = { yaml: '~2.8.3' };
  });
  const graph = f.reconcile(actualSelector(f.root));
  assert.deepEqual(
    graph.selected.find((member) => member.name === '@stynx-nyx/health').dependencyNames,
    ['@stynx-nyx/logging'],
  );
  assert.equal(
    graph.selected.some((member) => member.name === 'yaml'),
    false,
  );
});

for (const alias of ['link:../auth', '../auth', 'npm:@stynx-nyx/auth@1.0.0'])
  test(`unrelated dependency key cannot conceal unsupported ${alias}`, (t) => {
    const f = fixture(t);
    f.update('packages/health/package.json', (value) => {
      value.dependencies = { 'aliased-auth': alias };
    });
    refusal(() => f.graph(), /alias|protocol|directory|dependency/u);
  });

test('unresolved explicit workspace or STYNX dependency refuses', (t) => {
  const f = fixture(t);
  f.update('reference/api/package.json', (value) => {
    value.dependencies['@stynx-nyx/missing'] = 'workspace:*';
  });
  refusal(() => f.graph(), /Unresolved/u);
});

test('duplicate package names refuse even when one directory is unselected', (t) => {
  const f = fixture(t);
  f.add('unselected', { name: '@stynx-nyx/auth' });
  refusal(() => f.graph(), /duplicate/u);
});

test('dependency cycles refuse before a topological build order is reported', (t) => {
  const f = fixture(t);
  f.update('packages/storage/package.json', (value) => {
    value.dependencies['@stynx-nyx/auth'] = 'workspace:*';
  });
  refusal(() => f.graph(), /Cyclic/u);
});

test('overlapping workspace declarations deduplicate the same actual root', (t) => {
  const f = fixture(t);
  f.write(
    'pnpm-workspace.yaml',
    "packages:\n  - 'packages/*'\n  - 'packages/auth'\n  - 'reference/api'\n",
  );
  const graph = f.reconcile(actualSelector(f.root));
  assert.equal(graph.workspaces.filter((member) => member.name === '@stynx-nyx/auth').length, 1);
});

for (const pattern of [
  '../outside',
  '/absolute',
  'packages/**',
  'packages/{auth,core}',
  'packages/./auth',
  'packages/auth?',
])
  test(`unsupported workspace pattern refuses ${pattern}`, (t) => {
    const f = fixture(t);
    f.write('pnpm-workspace.yaml', `packages:\n  - ${JSON.stringify(pattern)}\n`);
    refusal(() => f.graph(), /pattern/u);
  });

test('duplicate YAML keys and missing package patterns fail closed', (t) => {
  const f = fixture(t);
  f.write('pnpm-workspace.yaml', "packages: ['packages/*']\npackages: ['reference/api']\n");
  refusal(() => f.graph(), /YAML/u);
  f.write('pnpm-workspace.yaml', 'packages: []\n');
  refusal(() => f.graph(), /patterns/u);
});

test('required root, required manifest and selected compiler config cannot be missing', (t) => {
  const f = fixture(t);
  f.write('pnpm-workspace.yaml', "packages: ['packages/*', 'reference/api', 'required/missing']\n");
  refusal(() => f.graph(), /root is missing/u);
  mkdirSync(join(f.root, 'required/missing'), { recursive: true });
  refusal(() => f.graph(), /manifest is missing/u);
  f.write('pnpm-workspace.yaml', "packages: ['packages/*', 'reference/api']\n");
  rmSync(join(f.root, 'packages/testing/tsconfig.json'));
  assert.throws(() => f.graph(), /ENOENT/u);
});

test('linked manifest, config and directory refuse even when target bytes are otherwise valid', (t) => {
  const f = fixture(t);
  for (const file of ['packages/auth/package.json', 'packages/auth/tsconfig.json']) {
    const bytes = readFileSync(join(f.root, file));
    f.write('retained.json', bytes);
    rmSync(join(f.root, file));
    symlinkSync(join(f.root, 'retained.json'), join(f.root, file));
    refusal(() => f.graph(), /owned regular/u);
    rmSync(join(f.root, file));
    f.write(file, bytes);
  }
  symlinkSync(join(f.root, 'packages/auth'), join(f.root, 'packages/linked'));
  refusal(() => f.graph(), /Linked/u);
});

test('case-colliding declared roots refuse on both case-sensitive and aliasing filesystems', (t) => {
  const f = fixture(t);
  // These are distinct directories on Linux and aliases on common macOS
  // volumes. The portable root identities must refuse in either case.
  const first = 'CaseRoot/Member';
  const second = 'caseroot/member';
  f.write(
    'pnpm-workspace.yaml',
    `packages: ['packages/*', 'reference/api', '${first}', '${second}']\n`,
  );
  f.json(`${first}/package.json`, { name: '@fixture/first' });
  f.json(`${second}/package.json`, { name: '@fixture/second' });
  refusal(() => f.graph(), /regular|collid/u);
});

test('unselected workspace build scripts cannot be mistaken for selected runtime closure', (t) => {
  const f = fixture(t);
  f.add('unselected', { scripts: { build: 'echo unreviewed' } });
  const graph = f.graph();
  assert.equal(
    graph.workspaces.some((member) => member.name === '@stynx-nyx/unselected'),
    true,
  );
  assert.equal(
    graph.selected.some((member) => member.name === '@stynx-nyx/unselected'),
    false,
  );
});

for (const output of [
  null,
  {},
  Object('[]'),
  {
    toJSON() {
      throw new Error('must not execute');
    },
  },
  ' '.repeat(16 * 1024 * 1024 + 1),
])
  test(`selector rejects nonprimitive or oversized input ${typeof output}`, (t) => {
    const f = fixture(t);
    refusal(() => f.reconcile(output), /bounded primitive/u);
  });

test('selector coercion hooks and getters are not invoked', (t) => {
  const f = fixture(t);
  let calls = 0;
  const output = {
    toString() {
      calls += 1;
      return JSON.stringify(rows(f));
    },
  };
  Object.defineProperty(output, 'toJSON', {
    get() {
      calls += 1;
      return () => [];
    },
  });
  refusal(() => f.reconcile(output), /primitive/u);
  assert.equal(calls, 0);
});

for (const [label, change, message] of [
  ['duplicate', (r) => r.push(r[0]), /duplicate/u],
  ['missing', (r) => r.pop(), /omits/u],
  ['extra', (r) => r.push({ name: '@stynx-nyx/extra', path: '/unbound' }), /closure/u],
  [
    'wrong name',
    (r) => {
      r[0].name = '@stynx-nyx/other';
    },
    /closure/u,
  ],
  [
    'wrong path',
    (r) => {
      r[0].path = join(dirname(r[0].path), 'wrong');
    },
    /closure/u,
  ],
  [
    'relative path',
    (r) => {
      r[0].path = 'packages/auth';
    },
    /Malformed/u,
  ],
  [
    'aliased dot path',
    (r) => {
      r[0].path += '/.';
    },
    /closure/u,
  ],
  [
    'missing own name',
    (r) => {
      delete r[0].name;
      Object.defineProperty(r[0], '__proto__', {
        value: { name: '@stynx-nyx/auth' },
        enumerable: true,
      });
    },
    /Malformed/u,
  ],
  [
    'missing own path',
    (r) => {
      delete r[0].path;
    },
    /Malformed/u,
  ],
])
  test(`selector refuses ${label} rows`, (t) => {
    const f = fixture(t);
    const selected = rows(f);
    change(selected);
    refusal(() => f.reconcile(JSON.stringify(selected)), message);
  });

test('selector outside symlink alias cannot stand in for the exact owned root', (t) => {
  const f = fixture(t);
  const outside = realpathSync(mkdtempSync(join(tmpdir(), 'stynx graph alias ')));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  symlinkSync(join(f.root, 'packages/auth'), join(outside, 'auth'));
  const selected = rows(f);
  selected.find((row) => row.name === '@stynx-nyx/auth').path = join(outside, 'auth');
  refusal(() => f.reconcile(JSON.stringify(selected)), /closure/u);
});

test('selector row order and unused real pnpm metadata cannot forge build execution', (t) => {
  const f = fixture(t);
  const selected = rows(f)
    .reverse()
    .map((row) => ({ ...row, version: '1.0.0', private: true }));
  const graph = f.reconcile(JSON.stringify(selected));
  assert.equal(graph.topologicalScriptOrder.at(-1), '@stynx-nyx/reference-api');
  assert.equal(Object.hasOwn(graph, 'buildSucceeded'), false);
  assert.equal(graph.readinessPromoting, false);
});

test('missing testing workspace cannot silently remove the selected devDependency', (t) => {
  const f = fixture(t);
  rmSync(join(f.root, 'packages/testing'), { recursive: true });
  refusal(() => f.graph(), /Unresolved/u);
});

test('unreviewed root package-manager identity refuses even without a build', (t) => {
  const f = fixture(t);
  f.update('package.json', (value) => {
    value.packageManager = 'pnpm@9.15.1';
  });
  refusal(() => f.graph(), /Unpinned/u);
});

for (const dependencies of [[], 'invalid', { '@stynx-nyx/auth': 1 }])
  test(`malformed dependency declarations fail closed (${JSON.stringify(dependencies)})`, (t) => {
    const f = fixture(t);
    f.update('reference/api/package.json', (value) => {
      value.dependencies = dependencies;
    });
    refusal(() => f.graph(), /Malformed/u);
  });

test('ordinary external registry dependencies remain external to selected workspace closure', (t) => {
  const f = fixture(t);
  f.update('packages/health/package.json', (value) => {
    value.dependencies = { yaml: '^2.8.3' };
  });
  const graph = f.reconcile(actualSelector(f.root));
  assert.equal(
    graph.selected.some((member) => member.name === 'yaml'),
    false,
  );
  assert.deepEqual(
    graph.selected.find((member) => member.name === '@stynx-nyx/health').dependencyNames,
    ['@stynx-nyx/logging'],
  );
});

test('invalid JSON and non-array selector JSON refuse without coercion', (t) => {
  const f = fixture(t);
  assert.throws(() => f.reconcile('{invalid'), SyntaxError);
  refusal(() => f.reconcile('{"name":"@stynx-nyx/auth"}'), /not an array/u);
});

function sourceOnlyTooling(f) {
  f.write(
    'pnpm-workspace.yaml',
    "packages:\n  - 'packages/*'\n  - 'reference/api'\n  - 'tools/*'\n",
  );
  const sourceOnlyToolNames = {
    'eslint-config': '@stynx-nyx/eslint-config',
    tsconfig: '@stynx-internal/tsconfig',
  };
  for (const [short, name] of Object.entries(sourceOnlyToolNames)) {
    f.json(`tools/${short}/package.json`, {
      name,
      private: true,
      scripts: { test: 'node --test test/tooling.spec.mjs' },
    });
  }
  f.update('reference/api/package.json', (value) => {
    value.devDependencies = Object.fromEntries(
      Object.values(sourceOnlyToolNames).map((name) => [name, 'workspace:*']),
    );
  });
}

test('actual pnpm includes both exact source-only tools without inventing compiler outputs', (t) => {
  const f = fixture(t);
  sourceOnlyTooling(f);
  const actual = actualSelector(f.root);
  const graph = f.reconcile(actual);
  assert.deepEqual(graph.selectedTooling.map((row) => row.root).sort(), [
    'tools/eslint-config',
    'tools/tsconfig',
  ]);
  for (const member of graph.selectedTooling) {
    assert.equal(member.classification, 'source-only-workspace-tooling');
    assert.deepEqual(member.dependencyNames, []);
    assert.equal(
      member.manifestSha256,
      hash(readFileSync(join(f.root, member.root, 'package.json'))),
    );
    assert.equal(Object.hasOwn(member, 'compilerConfig'), false);
    assert.equal(Object.hasOwn(member, 'buildScript'), false);
    assert.equal(graph.topologicalScriptOrder.includes(member.name), false);
    assert.equal(
      graph.selected.some((row) => row.name === member.name),
      false,
    );
    const missing = JSON.parse(actual).filter((row) => row.name !== member.name);
    refusal(() => f.reconcile(JSON.stringify(missing)), /omits/u);
  }
  assert.equal(graph.readinessPromoting, false);
});

test('actual candidate closure declares exactly 22 compiler members and two source-only tools', () => {
  const graph = reconcileHttpWorkspaceSelector(repo, actualSelector(repo));
  assert.equal(graph.selected.length, 22);
  assert.deepEqual(graph.selectedTooling.map((row) => row.root).sort(), [
    'tools/eslint-config',
    'tools/tsconfig',
  ]);
  assert.equal(graph.selected.length + graph.selectedTooling.length, 24);
  for (const name of [
    '@stynx-nyx/offline-sync',
    '@stynx-nyx/i18n',
    '@stynx-nyx/privacy',
    '@stynx-domain/demo-bookmark-api',
  ])
    assert.equal(
      graph.selected.some((row) => row.name === name),
      true,
    );
});

for (const short of ['eslint-config', 'tsconfig']) {
  for (const [label, mutate] of [
    [
      'public manifest',
      (value) => {
        value.private = false;
      },
    ],
    [
      'missing private identity',
      (value) => {
        delete value.private;
      },
    ],
    [
      'prebuild command',
      (value) => {
        value.scripts.prebuild = 'node injected.mjs';
      },
    ],
    [
      'postbuild command',
      (value) => {
        value.scripts.postbuild = 'node injected.mjs';
      },
    ],
    [
      'prepare command',
      (value) => {
        value.scripts.prepare = 'node injected.mjs';
      },
    ],
    [
      'arbitrary script',
      (value) => {
        value.scripts.injected = 'node injected.mjs';
      },
    ],
    [
      'local runtime edge',
      (value) => {
        value.dependencies = { '@stynx-nyx/contracts': 'workspace:*' };
      },
    ],
    [
      'local development edge',
      (value) => {
        value.devDependencies = { '@stynx-nyx/testing': 'workspace:*' };
      },
    ],
    [
      'local peer edge',
      (value) => {
        value.peerDependencies = { '@stynx-nyx/contracts': 'workspace:*' };
      },
    ],
    [
      'local optional edge',
      (value) => {
        value.optionalDependencies = { '@stynx-nyx/testing': 'workspace:*' };
      },
    ],
  ]) {
    test(`source-only ${short} refuses ${label}`, (t) => {
      const f = fixture(t);
      sourceOnlyTooling(f);
      f.update(`tools/${short}/package.json`, mutate);
      refusal(() => f.graph(), /source-only tooling/u);
    });
  }
  test(`source-only ${short} cannot relocate its fixed package identity`, (t) => {
    const f = fixture(t);
    sourceOnlyTooling(f);
    const manifest = f.read(`tools/${short}/package.json`);
    rmSync(join(f.root, 'tools', short), { recursive: true });
    f.json(`tools/relocated-${short}/package.json`, manifest);
    refusal(() => f.graph(), /source-only tooling/u);
  });
}
