import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import test, { after, before, beforeEach } from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  deriveHttpCompilerPlan,
  reconcileHttpCompilerOutputs,
} from '../../scripts/lib/http-compiler-plan.mjs';

// These real compiler witnesses qualify the diagnostic plan/map reconciler.
// They cannot establish that an arbitrary prior output was freshly compiled.
const repo = resolve(import.meta.dirname, '../..');
const require = createRequire(import.meta.url);
const installedCompiler = dirname(dirname(realpathSync(require.resolve('typescript'))));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
let checkout;
let saved;
let compiler;
const baseConfig = {
  compilerOptions: {
    target: 'ES2022',
    lib: ['ES5'],
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    declaration: true,
    declarationMap: true,
    sourceMap: true,
    strict: true,
    types: [],
  },
};
const projectConfig = {
  extends: '../../tsconfig.base.json',
  compilerOptions: { rootDir: '..', outDir: 'dist' },
  include: ['src/**/*.ts'],
};
function write(name, bytes) {
  const file = join(checkout, name);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
function json(name, value) {
  write(name, `${JSON.stringify(value, null, 2)}\n`);
}
function readJson(name) {
  return JSON.parse(readFileSync(join(checkout, name), 'utf8'));
}
function compile(packageRoot = 'packages/feature') {
  const result = spawnSync(process.execPath, [compiler, '-p', 'tsconfig.json'], {
    cwd: join(checkout, packageRoot),
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', NODE_DISABLE_COMPILE_CACHE: '1' },
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}
function plan(packageRoot = 'packages/feature') {
  return deriveHttpCompilerPlan({
    checkoutRoot: checkout,
    packageRoot,
    configPath: 'tsconfig.json',
  });
}
function reconcile(value = plan()) {
  return reconcileHttpCompilerOutputs({ checkoutRoot: checkout, plan: value });
}
function refusal(action, message) {
  assert.throws(action, (error) => {
    assert.equal(error.code, 'HTTP_COMPILER_CUSTODY_INVALID');
    assert.match(error.message, message);
    return true;
  });
}
function changeConfig(options) {
  json('packages/feature/tsconfig.json', {
    ...projectConfig,
    compilerOptions: { ...projectConfig.compilerOptions, ...options },
  });
}
function mutateMap(mutator, name = 'packages/feature/dist/feature/src/index.js.map') {
  const value = readJson(name);
  mutator(value);
  json(name, value);
}

before(() => {
  assert.equal(process.versions.node, '24.20.0');
  checkout = realpathSync(mkdtempSync(join(tmpdir(), 'stynx compiler espaço á ')));
  saved = realpathSync(mkdtempSync(join(tmpdir(), 'stynx compiler baseline ')));
  cpSync(installedCompiler, join(checkout, 'node_modules/typescript'), { recursive: true });
  compiler = join(checkout, 'node_modules/typescript/bin/tsc');
  assert.equal(
    hash(readFileSync(join(checkout, 'node_modules/typescript/lib/typescript.js'))),
    hash(readFileSync(join(installedCompiler, 'lib/typescript.js'))),
  );
  json('package.json', { private: true, type: 'commonjs' });
  json('tsconfig.base.json', baseConfig);
  json('packages/feature/tsconfig.json', projectConfig);
  write(
    'packages/feature/src/index.ts',
    "import { value } from '../../shared/src/value.js';\nexport const answer = value + 2;\n",
  );
  write('packages/shared/src/value.ts', 'export const value = 40;\n');
  compile();
  cpSync(join(checkout, 'packages'), join(saved, 'packages'), { recursive: true });
});
beforeEach(() => {
  rmSync(join(checkout, 'packages'), { recursive: true, force: true });
  cpSync(join(saved, 'packages'), join(checkout, 'packages'), { recursive: true });
  rmSync(join(checkout, 'docs'), { recursive: true, force: true });
  json('tsconfig.base.json', baseConfig);
});
after(() => {
  rmSync(checkout, { recursive: true, force: true });
  rmSync(saved, { recursive: true, force: true });
});

test('real pinned tsc emits both included and imported sibling modules with linked declaration maps', () => {
  const value = plan();
  assert.equal(value.compiler.version, '6.0.3');
  assert.deepEqual(value.configs.map((row) => row.path).sort(), [
    'packages/feature/tsconfig.json',
    'tsconfig.base.json',
  ]);
  assert.deepEqual(
    value.expectedOutputs.map((row) => row.path),
    [
      'packages/feature/dist/feature/src/index.d.ts',
      'packages/feature/dist/feature/src/index.d.ts.map',
      'packages/feature/dist/feature/src/index.js',
      'packages/feature/dist/feature/src/index.js.map',
      'packages/feature/dist/shared/src/value.d.ts',
      'packages/feature/dist/shared/src/value.d.ts.map',
      'packages/feature/dist/shared/src/value.js',
      'packages/feature/dist/shared/src/value.js.map',
    ],
  );
  assert.equal(
    value.sources.some((row) => row.path.endsWith('lib.es5.d.ts') && row.declarationInput),
    true,
  );
  assert.equal(require(join(checkout, 'packages/feature/dist/feature/src/index.js')).answer, 42);
  const result = reconcile(value);
  assert.equal(result.outputs.length, 8);
  assert.equal(result.mapLinks.length, 4);
  assert.equal(
    result.mapLinks.every((row) => row.sourcesContentVerified === 'absent'),
    true,
  );
  assert.equal(value.readinessPromoting, false);
  assert.equal(result.readinessPromoting, false);
  assert.equal(Object.hasOwn(result, 'fresh'), false);
  assert.equal(Object.hasOwn(result, 'complete'), false);
});

test('real mts and cts emit use compiler-derived module and declaration extensions', () => {
  changeConfig({});
  const config = readJson('packages/feature/tsconfig.json');
  config.include = ['src/**/*'];
  json('packages/feature/tsconfig.json', config);
  write('packages/feature/src/esm.mts', 'export const esm = 1;\n');
  write('packages/feature/src/common.cts', 'export const common = 2;\n');
  compile();
  const result = reconcile();
  assert.equal(result.outputs.length, 16);
  assert.equal(
    result.outputs.some((row) => row.path.endsWith('/esm.mjs')),
    true,
  );
  assert.equal(
    result.outputs.some((row) => row.path.endsWith('/common.d.cts.map')),
    true,
  );
});

for (const [name, file, content] of [
  ['source', 'packages/shared/src/value.ts', 'export const value = 41;\n'],
  [
    'extended config',
    'tsconfig.base.json',
    `${JSON.stringify({ ...baseConfig, compilerOptions: { ...baseConfig.compilerOptions, strict: false } })}\n`,
  ],
])
  test(`recomputed plan refuses changed ${name} bytes`, () => {
    const previous = plan();
    write(file, content);
    refusal(() => reconcile(previous), /inputs changed/u);
  });

test('compiler Program diagnostics refuse a genuine invalid transitive source', () => {
  write('packages/shared/src/value.ts', 'export const value: number = "invalid";\n');
  refusal(() => plan(), /Program diagnostics.*2322/u);
});

test('changed installed compiler bytes invalidate the previous plan even if version is unchanged', () => {
  const previous = plan();
  const file = join(checkout, 'node_modules/typescript/lib/typescript.js');
  const original = readFileSync(file);
  try {
    writeFileSync(file, Buffer.concat([original, Buffer.from('\n// changed compiler bytes\n')]));
    refusal(() => reconcile(previous), /inputs changed/u);
  } finally {
    writeFileSync(file, original);
  }
});

for (const [name, options] of [
  ['incremental', { incremental: true }],
  ['composite', { composite: true }],
  ['buildinfo', { tsBuildInfoFile: 'state.tsbuildinfo' }],
  ['no emit', { noEmit: true }],
  ['no check', { noCheck: true }],
  ['declaration only', { emitDeclarationOnly: true }],
  ['inline map', { sourceMap: false, inlineSourceMap: true }],
  ['inline sources', { inlineSources: true }],
  ['JavaScript input', { allowJs: true }],
  ['plugin', { plugins: [{ name: 'unreviewed-plugin' }] }],
  ['missing JS maps', { sourceMap: false }],
  ['missing declaration maps', { declarationMap: false }],
  ['outside output', { outDir: '../../../escaped-output' }],
])
  test(`refuses unsupported ${name} configuration without rewriting it`, () => {
    changeConfig(options);
    const before = readFileSync(join(checkout, 'packages/feature/tsconfig.json'));
    refusal(() => plan(), /configuration|output/u);
    assert.deepEqual(readFileSync(join(checkout, 'packages/feature/tsconfig.json')), before);
  });

test('actual compiler JSON imports are explicitly unsupported, never mapless accepted output', () => {
  changeConfig({ resolveJsonModule: true });
  write('packages/feature/src/data.json', '{"value":1}\n');
  write(
    'packages/feature/src/index.ts',
    "import data from './data.json';\nexport const answer = data.value;\n",
  );
  compile();
  refusal(() => plan(), /source kind/u);
});

test('duplicate source output identities refuse before roster admission', () => {
  // Explicit files preserve the same-stem TS/TSX pair that include discovery
  // otherwise de-duplicates before it can exercise an output collision.
  json('packages/feature/tsconfig.json', {
    extends: '../../tsconfig.base.json',
    compilerOptions: { ...projectConfig.compilerOptions, jsx: 'preserve' },
    files: ['src/index.ts', 'src/index.tsx'],
  });
  write('packages/feature/src/index.tsx', 'export const duplicate = 1;\n');
  refusal(() => plan(), /diagnostics|collid|collision/u);
});

test('extra stale output refuses even when all expected outputs remain present', () => {
  write('packages/feature/dist/stale.js', 'module.exports = 1;\n');
  refusal(() => reconcile(), /unexpected/u);
});

test('missing actual map refuses the complete expected roster', () => {
  rmSync(join(checkout, 'packages/feature/dist/shared/src/value.d.ts.map'));
  refusal(() => reconcile(), /Missing/u);
});

test('linked emitted output is rejected even when it points to identical owned bytes', () => {
  const file = join(checkout, 'packages/feature/dist/feature/src/index.js');
  write('linked-output.js', readFileSync(file));
  rmSync(file);
  symlinkSync(join(checkout, 'linked-output.js'), file);
  refusal(() => reconcile(), /Linked/u);
});

for (const [name, mutate] of [
  [
    'wrong emitted file',
    (map) => {
      map.file = 'other.js';
    },
  ],
  [
    'wrong map version',
    (map) => {
      map.version = 2;
    },
  ],
  [
    'nonempty source root',
    (map) => {
      map.sourceRoot = '../';
    },
  ],
  [
    'duplicate source links',
    (map) => {
      map.sources.push(map.sources[0]);
    },
  ],
  [
    'absolute source',
    (map) => {
      map.sources = [join(checkout, 'packages/feature/src/index.ts')];
    },
  ],
  [
    'URL source',
    (map) => {
      map.sources = ['file:///unowned.ts'];
    },
  ],
  [
    'query source',
    (map) => {
      map.sources[0] += '?unbound';
    },
  ],
  [
    'unbound existing source',
    (map) => {
      map.sources = ['../../../../shared/src/value.ts'];
    },
  ],
  [
    'escaped source',
    (map) => {
      const outside = join(saved, 'outside.ts');
      writeFileSync(outside, 'export const outside = true;\n');
      map.sources = [relative(join(checkout, 'packages/feature/dist/feature/src'), outside)];
    },
  ],
  [
    'wrong embedded bytes',
    (map) => {
      map.sourcesContent = ['export const answer = 999;'];
    },
  ],
  [
    'invalid mapping characters',
    (map) => {
      map.mappings = '#';
    },
  ],
  [
    'sectioned map',
    (map) => {
      map.sections = [];
    },
  ],
])
  test(`refuses ${name} in a real compiler map`, () => {
    mutateMap(mutate);
    refusal(() => reconcile(), /source|Source|map|owned regular/u);
  });

test('embedded exact source content is independently hashed when supplied', () => {
  mutateMap((map) => {
    map.sourcesContent = [readFileSync(join(checkout, 'packages/feature/src/index.ts'), 'utf8')];
  });
  const result = reconcile();
  assert.equal(
    result.mapLinks.find((row) => row.path.endsWith('/index.js.map')).sourcesContentVerified,
    'verified',
  );
});

test('invalid map JSON refuses without partial output admission', () => {
  write('packages/feature/dist/feature/src/index.js.map', '{invalid');
  refusal(() => reconcile(), /source map JSON/u);
});

for (const directive of [
  '',
  '\n//# sourceMappingURL=https://example.invalid/map\n',
  '\n//# sourceMappingURL=index.js.map\n',
])
  test(`missing, substituted or duplicate map directive refuses (${JSON.stringify(directive)})`, () => {
    const file = 'packages/feature/dist/feature/src/index.js';
    const code = readFileSync(join(checkout, file), 'utf8');
    write(
      file,
      directive === '' ? code.replace(/^\/\/# sourceMappingURL=.*$/mu, '') : code + directive,
    );
    refusal(() => reconcile(), /exact external map/u);
  });

test('caller toJSON cannot conceal fabricated plan data or run during admission', () => {
  const value = plan();
  let called = false;
  value.toJSON = () => {
    called = true;
    return plan();
  };
  refusal(() => reconcile(value), /plain/u);
  assert.equal(called, false);
});

test('caller getter is refused without evaluating it', () => {
  const value = plan();
  let called = false;
  Object.defineProperty(value, 'expectedOutputs', {
    enumerable: true,
    get() {
      called = true;
      return [];
    },
  });
  refusal(() => reconcile(value), /accessor/u);
  assert.equal(called, false);
});

test('tampered or added plan fields cannot be consumed instead of the recomputed plan', () => {
  const value = plan();
  value.expectedOutputs[0].source = 'packages/shared/src/value.ts';
  refusal(() => reconcile(value), /inputs changed/u);
  const extra = plan();
  extra.complete = true;
  refusal(() => reconcile(extra), /inputs changed/u);
});

test('map reconciliation alone intentionally cannot prove module bytes came from tsc', () => {
  write(
    'packages/feature/dist/feature/src/index.js',
    'module.exports = { answer: 999 };\n//# sourceMappingURL=index.js.map\n',
  );
  const result = reconcile();
  assert.equal(
    result.outputs.find((row) => row.path.endsWith('/index.js')).sha256,
    hash(readFileSync(join(checkout, 'packages/feature/dist/feature/src/index.js'))),
  );
  assert.equal(result.readinessPromoting, false);
  assert.equal(Object.hasOwn(result, 'fresh'), false);
});

function actualCore() {
  cpSync(join(checkout, 'packages/feature'), join(checkout, 'packages/core'), { recursive: true });
  rmSync(join(checkout, 'packages/core/dist'), { recursive: true });
  cpSync(join(repo, 'packages/core/scripts'), join(checkout, 'packages/core/scripts'), {
    recursive: true,
  });
  json('docs/framework/api/openapi.json', {
    openapi: '3.1.0',
    info: { title: 'Actual generator fixture', version: '1' },
    paths: {},
  });
  compile('packages/core');
  const generated = spawnSync(process.execPath, ['scripts/emit-openapi.mjs'], {
    cwd: join(checkout, 'packages/core'),
    encoding: 'utf8',
  });
  assert.equal(generated.status, 0, generated.stderr);
  return plan('packages/core');
}

test('real repository core generator output is bound to its actual API input', () => {
  const value = actualCore();
  const result = reconcile(value);
  assert.equal(result.outputs.length, 9);
  assert.equal(result.mapLinks.length, 4);
  assert.equal(
    result.outputs.find((row) => row.path.endsWith('/openapi/openapi.json')).sha256,
    hash(`${JSON.stringify(readJson('docs/framework/api/openapi.json'), null, 2)}\n`),
  );
});

test('changed core generator asset cannot be admitted by a valid compiler plan', () => {
  const value = actualCore();
  write('packages/core/dist/openapi/openapi.json', '{"openapi":"tampered"}\n');
  refusal(() => reconcile(value), /actual generator input/u);
});

test('real core generator and reconciler both refuse invalid OpenAPI input', () => {
  const value = actualCore();
  json('docs/framework/api/openapi.json', { paths: {} });
  const run = spawnSync(process.execPath, ['scripts/emit-openapi.mjs'], {
    cwd: join(checkout, 'packages/core'),
    encoding: 'utf8',
  });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /Invalid OpenAPI/u);
  refusal(() => reconcile(value), /Invalid actual core/u);
});

test('outside entry config cannot masquerade as an owned project config', () => {
  refusal(
    () =>
      deriveHttpCompilerPlan({
        checkoutRoot: checkout,
        packageRoot: 'packages/feature',
        configPath: '../../tsconfig.base.json',
      }),
    /escapes/u,
  );
});

test('invalid actual extended configuration refuses with compiler diagnostics', () => {
  write('tsconfig.base.json', '{invalid');
  refusal(() => plan(), /Invalid compiler config/u);
});

test('imported source symlink cannot escape to an existing outside file', () => {
  const outside = join(saved, 'outside-source.ts');
  writeFileSync(outside, 'export const value = 40;\n');
  const source = join(checkout, 'packages/shared/src/value.ts');
  rmSync(source);
  symlinkSync(outside, source);
  refusal(() => plan(), /owned regular|escape/u);
});

test('compiler installation outside the owned checkout is refused', () => {
  const local = join(checkout, 'node_modules/typescript');
  const retained = join(checkout, 'retained-compiler');
  renameSync(local, retained);
  try {
    symlinkSync(installedCompiler, local);
    refusal(() => plan(), /outside the private installation/u);
  } finally {
    rmSync(local);
    renameSync(retained, local);
  }
});

test('nested caller getters are refused without evaluation', () => {
  const value = plan();
  let calls = 0;
  Object.defineProperty(value.sources[0], 'sha256', {
    enumerable: true,
    get() {
      calls += 1;
      return '0'.repeat(64);
    },
  });
  refusal(() => reconcile(value), /accessor/u);
  assert.equal(calls, 0);
});

test('hidden, cyclic and symbol-keyed plan data cannot be omitted from comparison', () => {
  const hidden = plan();
  Object.defineProperty(hidden, 'concealed', { value: true });
  refusal(() => reconcile(hidden), /hidden/u);
  const cycle = plan();
  cycle.self = cycle;
  refusal(() => reconcile(cycle), /acyclic/u);
  const symbol = plan();
  symbol[Symbol('unbound')] = true;
  refusal(() => reconcile(symbol), /hidden/u);
});

test('wrong compiler version is refused in a fresh actual Node process', () => {
  const file = join(checkout, 'node_modules/typescript/lib/typescript.js');
  const original = readFileSync(file, 'utf8');
  assert.match(original, /var version = "6\.0\.3";/u);
  try {
    writeFileSync(file, original.replace('var version = "6.0.3";', 'var version = "6.0.2";'));
    const run = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
      import { deriveHttpCompilerPlan } from ${JSON.stringify(pathToFileURL(join(repo, 'scripts/lib/http-compiler-plan.mjs')).href)};
      deriveHttpCompilerPlan({checkoutRoot:${JSON.stringify(checkout)},packageRoot:'packages/feature',configPath:'tsconfig.json'});
    `,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(run.status, 1);
    assert.match(run.stderr, /pinned TypeScript 6\.0\.3/u);
  } finally {
    writeFileSync(file, original);
  }
});
