import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  symlinkSync,
  realpathSync,
  cpSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createNativeCoverage } from '../../tools/repo-config/native-coverage.mjs';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/lib/tsc.js');
const engineRequire = createRequire(require.resolve('vitest/package.json'));
const { moduleRunnerTransform } = await import(pathToFileURL(engineRequire.resolve('vite')));
const remappingUmd = engineRequire('@jridgewell/remapping');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceText =
  "import { double } from './math.js';\nexport function choose(enabled: boolean): string {\n  return enabled ? `olá 日本語 ${double(2)}` : 'off';\n}\n";
async function fixture(run, { inlineSources = false } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx native spaces 日本語-')));
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/service.ts'), sourceText);
    writeFileSync(
      join(root, 'src/math.ts'),
      'export function double(value: number): number { return value * 2; }\n',
    );
    writeFileSync(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'Node16',
          moduleResolution: 'Node16',
          rootDir: 'src',
          outDir: 'dist',
          sourceMap: true,
          inlineSources,
          types: [],
          strict: true,
        },
        include: ['src/**/*.ts'],
      }),
    );
    const git = (...args) =>
      execFileSync('git', args, {
        cwd: root,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    git('init', '-q');
    git('add', 'src', 'tsconfig.json');
    git(
      '-c',
      'user.name=Inspector Fixture',
      '-c',
      'user.email=fixture@invalid.test',
      'commit',
      '-qm',
      'test: create fixture',
    );
    execFileSync(process.execPath, [compiler, '-p', join(root, 'tsconfig.json')], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const options = {
      packageDir: root,
      modules: ['math', 'service'].map((name) => ({
        source: `src/${name}.ts`,
        output: `dist/${name}.js`,
      })),
      includes: ['src/**/*.ts'],
      excludes: [],
    };
    return await run({
      root,
      git,
      options,
      admit: () => createNativeCoverage(options),
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
test('actual compiler output retains bytes/map geometry and materializes only missing source content', () =>
  fixture(({ root, admit }) => {
    const before = readFileSync(join(root, 'dist/service.js.map'));
    const original = JSON.parse(before);
    assert.equal(Object.hasOwn(original, 'sourcesContent'), false);
    const helper = admit();
    const result = helper.nativeTransform(join(root, 'dist/service.js'));
    assert.equal(result.code, readFileSync(join(root, 'dist/service.js'), 'utf8'));
    assert.deepEqual(result.map.sourcesContent, [sourceText]);
    const projected = structuredClone(result.map);
    delete projected.sourcesContent;
    assert.deepEqual(projected, original);
    assert.deepEqual(readFileSync(join(root, 'dist/service.js.map')), before);
    const proof = helper.evidence.bindings.find((row) => row.source.endsWith('/service.ts'));
    assert.equal(proof.nativeMapSha256, digest(before));
    assert.equal(proof.nativeOriginalMapText, before.toString('utf8'));
    assert.equal(proof.nativeConversionMapSha256, digest(JSON.stringify(result.map)));
    assert.equal(proof.nativeSourceContentMaterialized, true);
    assert.equal(proof.nativeCodeUnits, result.code.length);
    assert.equal(helper.evidence.compiler.version, '6.0.3');
  }));
test('existing exact compiler sourcesContent is retained and every returned map is isolated', () =>
  fixture(
    ({ root, admit }) => {
      const helper = admit();
      const path = join(root, 'dist/service.js');
      const original = JSON.parse(readFileSync(`${path}.map`));
      const first = helper.nativeTransform(path);
      assert.deepEqual(first.map, original);
      first.map.sources[0] = 'tampered';
      first.map.sourcesContent[0] = 'tampered';
      first.map.names.push('tampered');
      assert.deepEqual(helper.nativeTransform(path).map, original);
      assert.equal(
        helper.evidence.bindings.find((row) => row.output === path).nativeSourceContentMaterialized,
        false,
      );
    },
    { inlineSources: true },
  ));
test('source Program transform executes the same behavior while native IDs are left to Node', () =>
  fixture(({ root, admit }) => {
    const helper = admit();
    const source = join(root, 'src/service.ts');
    const transformed = helper.plugin.transform(sourceText, source);
    assert.match(transformed.code, /export function choose/u);
    assert.deepEqual(transformed.map.sources, [source]);
    assert.deepEqual(transformed.map.sourcesContent, [sourceText]);
    assert.equal(helper.plugin.transform('native bytes', join(root, 'dist/service.js')), null);
    const actual = createRequire(join(root, 'entry.cjs'))('./dist/service.js');
    assert.equal(actual.choose(true), 'olá 日本語 4');
    assert.equal(actual.choose(false), 'off');
    assert.throws(
      () => helper.plugin.transform(`${sourceText}\n`, source),
      /received source differs/u,
    );
  }));
test('SWC delegation keeps receiver/arguments for external modules and never rewrites admitted owned bytes', () =>
  fixture(({ root, admit }) => {
    const helper = admit();
    let calls = 0;
    const receiver = { identity: 'real plugin context' };
    const swc = {
      name: 'host SWC port',
      transform: {
        order: 'pre',
        handler(...args) {
          calls++;
          assert.equal(this, receiver);
          return args;
        },
      },
    };
    const wrapped = helper.wrapSwc(swc);
    assert.equal(wrapped.transform.order, 'pre');
    assert.deepEqual(
      wrapped.transform.handler.call(receiver, 'host', 'external.ts', {
        ssr: true,
      }),
      ['host', 'external.ts', { ssr: true }],
    );
    assert.equal(
      wrapped.transform.handler.call(receiver, sourceText, join(root, 'src/service.ts')),
      null,
    );
    assert.equal(
      wrapped.transform.handler.call(receiver, 'native', join(root, 'dist/service.js')),
      null,
    );
    assert.equal(calls, 1);
    assert.throws(() => helper.wrapSwc({ transform: null }), /unsupported/u);
  }));
test('owned file URL, query, Vite and encoded aliases refuse while unrelated IDs stay outside the finite policy', () =>
  fixture(({ root, admit }) => {
    const helper = admit();
    const path = join(root, 'dist/service.js');
    for (const alias of [
      pathToFileURL(path).href,
      `${path}?v=1`,
      `/@fs${path}`,
      path.replace('spaces', '%73paces'),
    ])
      assert.throws(() => helper.nativeTransform(alias), /unsupported owned module ID/u);
    assert.equal(helper.nativeTransform(join(root, 'outside.js')), null);
    assert.equal(helper.nativeTransform(join(root, 'src/math.ts')), null);
  }));
test('snapshot rejects each changed source, native code, map, config, transitive dependency and candidate', () =>
  fixture(({ root, git, admit }) => {
    const helper = admit();
    for (const name of [
      'src/service.ts',
      'src/math.ts',
      'dist/service.js',
      'dist/service.js.map',
      'tsconfig.json',
    ]) {
      const path = join(root, name),
        original = readFileSync(path);
      writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
      assert.throws(() => helper.verify(), /input changed after admission/u, name);
      writeFileSync(path, original);
      helper.verify();
    }
    writeFileSync(join(root, 'src/new.ts'), 'export const newMember=1;\n');
    assert.throws(() => helper.verify(), /population changed/u);
    rmSync(join(root, 'src/new.ts'));
    helper.verify();
    git(
      '-c',
      'user.name=Inspector Fixture',
      '-c',
      'user.email=fixture@invalid.test',
      'commit',
      '--allow-empty',
      '-qm',
      'test: advance candidate',
    );
    assert.throws(() => helper.verify(), /candidate changed/u);
  }));
test('stale emitted bytes and genuine malformed/misbound source maps refuse admission', () =>
  fixture(({ root, admit }) => {
    const code = join(root, 'dist/service.js'),
      bytes = readFileSync(code);
    writeFileSync(code, Buffer.concat([bytes, Buffer.from('\n')]));
    assert.throws(admit, /stale or differs/u);
    writeFileSync(code, bytes);
    const path = `${code}.map`,
      original = readFileSync(path),
      map = JSON.parse(original);
    for (const mutated of [
      { ...map, sources: ['../src/math.ts'] },
      { ...map, sourcesContent: ['wrong'] },
      { ...map, sections: [] },
      { ...map, unknown: true },
    ]) {
      writeFileSync(path, JSON.stringify(mutated));
      assert.throws(admit, /source|binding/u);
    }
    writeFileSync(path, '{');
    assert.throws(admit, /malformed native source map/u);
    writeFileSync(path, original);
  }));
test('closed binding/array declarations refuse holes/accessors/extra keys without executing getters', () =>
  fixture(({ options }) => {
    let calls = 0;
    const binding = { output: 'dist/service.js' };
    Object.defineProperty(binding, 'source', {
      enumerable: true,
      get() {
        calls++;
        return 'src/service.ts';
      },
    });
    const arrays = [new Array(1), Object.assign([...options.modules], { extra: true })];
    const accessor = [...options.modules];
    Object.defineProperty(accessor, 0, {
      enumerable: true,
      get() {
        calls++;
        return options.modules[0];
      },
    });
    arrays.push(accessor);
    for (const modules of arrays)
      assert.throws(() => createNativeCoverage({ ...options, modules }), /accessors|holes|extra/u);
    assert.throws(
      () => createNativeCoverage({ ...options, modules: [binding] }),
      /binding requires/u,
    );
    assert.throws(
      () =>
        createNativeCoverage({
          ...options,
          modules: [{ ...options.modules[0], extra: true }],
        }),
      /binding requires/u,
    );
    assert.equal(calls, 0);
  }));
test('duplicate bindings, undeclared census members, escaping and symlink paths refuse', () =>
  fixture(({ root, options, admit }) => {
    assert.throws(
      () =>
        createNativeCoverage({
          ...options,
          modules: [...options.modules, options.modules[0]],
        }),
      /duplicate/u,
    );
    assert.throws(
      () =>
        createNativeCoverage({
          ...options,
          modules: options.modules.slice(0, 1),
        }),
      /census/u,
    );
    assert.throws(
      () =>
        createNativeCoverage({
          ...options,
          modules: [{ source: '../src/math.ts', output: 'dist/math.js' }],
        }),
      /portable/u,
    );
    symlinkSync(join(root, 'src/math.ts'), join(root, 'src/alias.ts'));
    assert.throws(
      () =>
        createNativeCoverage({
          ...options,
          modules: [{ source: 'src/alias.ts', output: 'dist/math.js' }],
        }),
      /symbolic link/u,
    );
    rmSync(join(root, 'src/alias.ts'));
    assert.doesNotThrow(admit);
  }));

test('isolated installed compiler/package/lib snapshots reject real dependency byte tampering', async () => {
  const owner = realpathSync(mkdtempSync(join(tmpdir(), 'stynx compiler dependency 日本語-')));
  try {
    mkdirSync(join(owner, 'tools/repo-config'), { recursive: true });
    mkdirSync(join(owner, 'node_modules'), { recursive: true });
    cpSync(
      require.resolve('typescript/package.json').replace(/\/package\.json$/u, ''),
      join(owner, 'node_modules/typescript'),
      { recursive: true },
    );
    const codecManifest = require.resolve('@jridgewell/sourcemap-codec/package.json');
    cpSync(dirname(codecManifest), join(owner, 'node_modules/@jridgewell/sourcemap-codec'), {
      recursive: true,
    });
    for (const name of [
      'package.json',
      'pnpm-lock.yaml',
      'tools/repo-config/native-source-map.mjs',
    ]) {
      writeFileSync(join(owner, name), readFileSync(new URL(`../../${name}`, import.meta.url)));
    }
    const helperPath = join(owner, 'tools/repo-config/native-coverage.mjs');
    const helperBytes = readFileSync(
      new URL('../../tools/repo-config/native-coverage.mjs', import.meta.url),
    );
    writeFileSync(helperPath, helperBytes);
    assert.deepEqual(readFileSync(helperPath), helperBytes);
    const { createNativeCoverage: isolated } = await import(pathToFileURL(helperPath).href);
    await fixture(({ options }) => {
      const helper = isolated(options);
      assert.equal(helper.evidence.compiler.version, '6.0.3');
      const library = helper.evidence.inputs.find((row) =>
        row.path.endsWith('/lib/lib.es2022.d.ts'),
      );
      assert.ok(library, 'real Program must bind its actual standard library');
      for (const path of [
        helper.evidence.compiler.path,
        join(owner, 'node_modules/typescript/package.json'),
        library.path,
      ]) {
        assert.ok(
          path.startsWith(owner),
          'dependency mutation must stay inside owned copied runtime',
        );
        const original = readFileSync(path);
        writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
        assert.throws(() => helper.verify(), /input changed after admission/u);
        writeFileSync(path, original);
        helper.verify();
      }
      for (const path of [
        join(owner, 'tools/repo-config/native-source-map.mjs'),
        join(owner, 'package.json'),
        join(owner, 'pnpm-lock.yaml'),
        join(owner, 'node_modules/@jridgewell/sourcemap-codec/package.json'),
        createRequire(helperPath).resolve('@jridgewell/sourcemap-codec'),
      ]) {
        const original = readFileSync(path);
        writeFileSync(path, Buffer.concat([original, Buffer.from('\n')]));
        assert.throws(() => helper.verify(), /input changed after admission/u);
        writeFileSync(path, original);
        helper.verify();
      }
    });
  } finally {
    rmSync(owner, { recursive: true, force: true });
  }
});

async function actualSource(helper, root) {
  const id = join(root, 'src/service.ts');
  const emitted = helper.plugin.transform(sourceText, id);
  const actual = await moduleRunnerTransform(emitted.code, emitted.map, id, sourceText);
  assert.equal(actual.ssr, true);
  return { id, actual };
}

test('real bundled, UMD, ordinary, hostile-class and null-prototype maps have identical own-data repair', () =>
  fixture(async ({ root, admit }) => {
    const initial = admit(),
      { id, actual } = await actualSource(initial, root);
    assert.notEqual(Object.getPrototypeOf(actual.map), Object.prototype);
    const descriptors = Object.getOwnPropertyDescriptors(actual.map);
    const umdMap = remappingUmd(
      { version: 3, names: [], sources: [], sourcesContent: [], mappings: '' },
      () => {
        throw Error('empty witness must not load');
      },
      { excludeContent: false, decodedMappings: false },
    );
    let calls = 0;
    class HostileMap {
      get constructorName() {
        calls++;
        throw Error('inherited getter');
      }
      get sourceRoot() {
        calls++;
        throw Error('inherited source root');
      }
      toString() {
        calls++;
        throw Error('inherited toString');
      }
      toJSON() {
        calls++;
        throw Error('inherited toJSON');
      }
    }
    for (const key of ['constructor', Symbol.toStringTag]) {
      Object.defineProperty(HostileMap.prototype, key, {
        configurable: true,
        get() {
          calls++;
          throw Error('opaque prototype must remain unread');
        },
      });
    }
    const prototypes = [
      Object.getPrototypeOf(actual.map),
      Object.getPrototypeOf(umdMap),
      Object.prototype,
      HostileMap.prototype,
      null,
    ];
    const results = [];
    for (const prototype of prototypes) {
      const helper = admit();
      const map = Object.defineProperties(Object.create(prototype), structuredClone(descriptors));
      const input = { ...actual, map };
      const before = Object.getOwnPropertyDescriptors(map);
      const output = helper.repairSourceTransform(id, input);
      assert.equal(output.code, actual.code);
      assert.equal(Object.getPrototypeOf(output.map), Object.prototype);
      assert.notEqual(output, input);
      assert.notEqual(output.map, map);
      assert.deepEqual(Object.getOwnPropertyDescriptors(map), before);
      assert.equal(Object.getPrototypeOf(map), prototype);
      assert.equal(helper.evidence.sourceTransforms[0].prototypeTreatment, 'IGNORED_OWN_DATA_ONLY');
      results.push(output.map.mappings);
      helper.verify();
    }
    assert.equal(new Set(results).size, 1);
    assert.equal(calls, 0);
  }));

test('inherited required fields and hostile own descriptors refuse without invoking code', () =>
  fixture(async ({ root, admit }) => {
    const { id, actual } = await actualSource(admit(), root);
    let calls = 0;
    const mutations = [
      (map) => {
        const version = map.version;
        delete map.version;
        Object.setPrototypeOf(map, { version });
      },
      (map) =>
        Object.defineProperty(map, 'sourceRoot', {
          enumerable: true,
          configurable: true,
          get() {
            calls++;
            return '';
          },
        }),
      (map) => {
        map[Symbol('unknown')] = true;
      },
      (map) => {
        map.sources.extra = true;
      },
      (map) => {
        Object.defineProperty(map.sources, 0, {
          enumerable: true,
          get() {
            calls++;
            return id;
          },
        });
      },
    ];
    for (const mutate of mutations) {
      const helper = admit(),
        map = structuredClone(actual.map);
      mutate(map);
      assert.throws(
        () => helper.repairSourceTransform(id, { ...actual, map }),
        /fields|descriptors|array|grammar/u,
      );
      assert.throws(() => helper.verify(), /fields|descriptors|array|grammar/u);
    }
    assert.equal(calls, 0);
  }));

test('actual result, map and nested-array proxies refuse without triggering reflection traps', () =>
  fixture(async ({ root, admit }) => {
    const { id, actual } = await actualSource(admit(), root);
    let calls = 0;
    const proxy = (value) =>
      new Proxy(value, {
        get() {
          calls++;
          throw Error('get trap');
        },
        ownKeys() {
          calls++;
          throw Error('ownKeys trap');
        },
        getPrototypeOf() {
          calls++;
          throw Error('prototype trap');
        },
      });
    for (const kind of ['result', 'map', 'array']) {
      const helper = admit(),
        input = { ...actual, map: structuredClone(actual.map) };
      if (kind === 'map') input.map = proxy(input.map);
      if (kind === 'array') input.map.sources = proxy(input.map.sources);
      assert.throws(
        () => helper.repairSourceTransform(id, kind === 'result' ? proxy(input) : input),
        /ordinary|retained|array/u,
      );
      assert.throws(() => helper.verify(), /ordinary|retained|array/u);
    }
    assert.equal(calls, 0);
  }));

test('source repair preserves descriptor flags and returns fresh arrays on repeated invocation', () =>
  fixture(async ({ root, admit }) => {
    const helper = admit(),
      { id, actual } = await actualSource(helper, root);
    const map = Object.defineProperties({}, Object.getOwnPropertyDescriptors(actual.map));
    Object.defineProperty(map, 'sourceRoot', {
      value: undefined,
      enumerable: true,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(map, 'mappings', {
      value: map.mappings,
      enumerable: true,
      configurable: false,
      writable: false,
    });
    Object.defineProperty(map.sources, 0, {
      value: map.sources[0],
      enumerable: true,
      configurable: false,
      writable: false,
    });
    const input = { ...actual, map };
    Object.defineProperty(input, 'map', {
      value: map,
      enumerable: true,
      configurable: false,
      writable: false,
    });
    const before = Object.getOwnPropertyDescriptors(input),
      first = helper.repairSourceTransform(id, input);
    assert.deepEqual(Object.getOwnPropertyDescriptors(input), before);
    for (const key of ['sourceRoot', 'mappings']) {
      const descriptor = Object.getOwnPropertyDescriptor(first.map, key);
      assert.equal(descriptor.writable, false);
      assert.equal(descriptor.configurable, false);
    }
    assert.equal(Object.getOwnPropertyDescriptor(first, 'map').writable, false);
    assert.deepEqual(
      Object.getOwnPropertyDescriptor(first.map.sources, 0),
      Object.getOwnPropertyDescriptor(map.sources, 0),
    );
    first.map.names.push('consumer mutation');
    const second = helper.repairSourceTransform(id, input);
    assert.deepEqual(second.map.names, map.names);
    assert.notEqual(first.map.sources, second.map.sources);
    assert.notEqual(first.map.sourcesContent, second.map.sourcesContent);
    assert.deepEqual(Object.getOwnPropertyDescriptors(input), before);
  }));

test('malformed owned source maps remain sticky after restoration and external IDs cannot enter repair', () =>
  fixture(async ({ root, admit }) => {
    const { id, actual } = await actualSource(admit(), root);
    const helper = admit(),
      bad = { ...actual, map: structuredClone(actual.map) };
    bad.map.sourcesContent[0] += '\n';
    let failure;
    try {
      helper.repairSourceTransform(id, bad);
    } catch (error) {
      failure = error;
    }
    assert.match(failure.message, /identity/u);
    assert.throws(
      () => helper.repairSourceTransform(id, actual),
      (error) => error === failure,
    );
    assert.throws(
      () => helper.verify(),
      (error) => error === failure,
    );
    const outside = admit();
    assert.throws(
      () => outside.repairSourceTransform(join(root, 'outside.ts'), actual),
      /outside the admitted census/u,
    );
    assert.equal(outside.evidence.sourceTransforms[0].status, 'REFUSED');
  }));

// Static configuration discovery grants no native-byte admission. Each actual
// execution hook must acquire the same strict compiled-file proof independently.
for (const boundary of ['buildStart', 'transform', 'swc'])
  test(`native config discovery without outputs preserves first ${boundary} admission refusal`, () =>
    fixture(({ root, options }) => {
      rmSync(join(root, 'dist'), { recursive: true });
      let config;
      assert.doesNotThrow(() => {
        config = createVitestConfig({
          packageDir: root,
          packageName: '@stynx-nyx/privacy',
          nativeCoverageModules: options.modules,
          collectCoverageFrom: options.includes,
        });
      });
      assert.equal(config.test.coverage.provider, 'custom');
      assert.deepEqual(config.test.coverage.nativeCoverage.modules, options.modules);
      const native = config.plugins.find(
        (plugin) => plugin.name === 'stynx:finite-native-coverage',
      );
      assert(native);
      const swc = config.plugins.at(-1);
      const transform = typeof swc.transform === 'function' ? swc.transform : swc.transform.handler;
      const invoke =
        boundary === 'buildStart'
          ? () => native.buildStart()
          : boundary === 'transform'
            ? () => native.transform(sourceText, join(root, 'src/service.ts'))
            : () => transform.call({}, sourceText, join(root, 'src/service.ts'));
      assert.throws(invoke, { code: 'ENOENT', syscall: 'lstat', path: join(root, 'dist') });
    }));

test('deferred native configuration admits actual compiler bytes and retains later tamper refusal', () =>
  fixture(({ root, options }) => {
    const config = createVitestConfig({
      packageDir: root,
      packageName: '@stynx-nyx/privacy',
      nativeCoverageModules: options.modules,
      collectCoverageFrom: options.includes,
    });
    const native = config.plugins.find((plugin) => plugin.name === 'stynx:finite-native-coverage');
    assert.doesNotThrow(() => native.buildStart());
    const transformed = native.transform(sourceText, join(root, 'src/service.ts'));
    assert.equal(typeof transformed.code, 'string');
    writeFileSync(join(root, 'dist/service.js'), '// actual emitted-byte tamper\n');
    assert.throws(() => native.buildStart(), /input changed after admission/);
    assert.throws(
      () => native.transform(sourceText, join(root, 'src/service.ts')),
      /input changed after admission/,
    );
  }));
