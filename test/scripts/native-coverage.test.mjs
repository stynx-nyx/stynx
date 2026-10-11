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
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { createNativeCoverage } from '../../tools/repo-config/native-coverage.mjs';
const require = createRequire(import.meta.url);
const compiler = require.resolve('typescript/lib/tsc.js');
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sourceText =
  "import { double } from './math.js';\nexport function choose(enabled: boolean): string {\n  return enabled ? `olá 日本語 ${double(2)}` : 'off';\n}\n";
function fixture(run, { inlineSources = false } = {}) {
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
    return run({
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
    mkdirSync(join(owner, 'tools'), { recursive: true });
    mkdirSync(join(owner, 'node_modules'), { recursive: true });
    cpSync(
      require.resolve('typescript/package.json').replace(/\/package\.json$/u, ''),
      join(owner, 'node_modules/typescript'),
      { recursive: true },
    );
    const helperPath = join(owner, 'tools/native-coverage.mjs');
    const helperBytes = readFileSync(
      new URL('../../tools/repo-config/native-coverage.mjs', import.meta.url),
    );
    writeFileSync(helperPath, helperBytes);
    assert.deepEqual(readFileSync(helperPath), helperBytes);
    const { createNativeCoverage: isolated } = await import(pathToFileURL(helperPath).href);
    fixture(({ options }) => {
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
    });
  } finally {
    rmSync(owner, { recursive: true, force: true });
  }
});
