import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import * as ts from 'typescript';
import {
  httpComposition,
  httpCompositionIds,
  isHttpComposition,
} from '../../scripts/lib/http-composition-roster.mjs';
import { observeReferenceBootstrapModule } from '../../scripts/lib/http-runtime-bindings.mjs';
import { createHttpRuntimeProtocol } from '../../scripts/lib/http-runtime-protocol.mjs';
import { createProtocolFixture, moduleFacts } from './support/http-runtime-protocol-fixture.mjs';

// Independent contract population. These tests never invoke an application,
// import a root module, fill an admission floor, or claim fresh-build custody.
const expectedRoots = [
  ['reference', 'bootstrap', 'app.module', 'AppModule'],
  [
    'offlineE6',
    'performance/offline-e6',
    'performance/offline-e6.module',
    'OfflineE6ApplicationModule',
  ],
  [
    'offlineCTG9',
    'performance/offline-ctg9',
    'performance/offline-ctg9.module',
    'OfflineCTG9ApplicationModule',
  ],
  ['i18n', 'performance/i18n', 'performance/i18n.module', 'I18nApplicationModule'],
  ['privacy', 'performance/privacy', 'performance/privacy.module', 'PrivacyApplicationModule'],
  ['domain', 'performance/domain', 'performance/domain.module', 'DomainApplicationModule'],
].map(([id, factory, module, rootExport]) => ({
  id,
  source: `reference/api/src/${factory}.ts`,
  emitted: `reference/api/dist/reference/api/src/${factory}.js`,
  rootModule: `reference/api/src/${module}.ts`,
  emittedRootModule: `reference/api/dist/reference/api/src/${module}.js`,
  rootExport,
  factoryExport: 'createReferenceApplication',
}));
const repository = resolve(import.meta.dirname, '../..');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx six roots espaço 日本語 ')));
const observations = new Map();
const fixtures = new Map();
const byteRow = (checkout, path, source = false) => {
  const file = join(checkout, path),
    bytes = readFileSync(file);
  const row = {
    path,
    sha256: hash(bytes),
    byteLength: bytes.length,
    permissions: lstatSync(file).mode & 0o7777,
  };
  return source
    ? {
        ...row,
        mode: '100644',
        blob: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'),
      }
    : row;
};
function put(checkout, path, bytes) {
  const file = join(checkout, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
}
function job(checkout, composition) {
  return {
    checkoutRoot: checkout,
    compositionId: composition.id,
    bootstrap: {
      source: byteRow(checkout, composition.source, true),
      emitted: byteRow(checkout, composition.emitted),
      map: byteRow(checkout, `${composition.emitted}.map`),
    },
  };
}
before(async () => {
  assert.equal(ts.version, '6.0.3');
  for (const composition of expectedRoots) {
    const checkout = join(root, composition.id);
    const source = readFileSync(join(repository, composition.source));
    put(checkout, composition.source, source);
    // Actual installed compiler transforms the exact production factory bytes.
    // Native maps are retained unchanged. This isolated transpilation is not
    // type checking, the 24-member build, or a private compiler-plan receipt.
    const output = ts.transpileModule(source.toString(), {
      fileName: composition.source,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        rootDir: '.',
        outDir: 'reference/api/dist',
        sourceMap: true,
      },
      reportDiagnostics: true,
    });
    assert.deepEqual(output.diagnostics, []);
    put(checkout, composition.emitted, output.outputText);
    put(checkout, `${composition.emitted}.map`, output.sourceMapText);
    observations.set(
      composition.id,
      await observeReferenceBootstrapModule(job(checkout, composition)),
    );
    const fixture = createProtocolFixture(repository, join(checkout, 'parser'));
    for (const path of [composition.source, composition.emitted, `${composition.emitted}.map`])
      put(fixture.template.cwd, path, readFileSync(join(checkout, path)));
    const observation = structuredClone(observations.get(composition.id));
    observation.bootstrap = job(fixture.template.cwd, composition).bootstrap;
    observation.evaluatedModuleURL = pathToFileURL(
      join(fixture.template.cwd, composition.emitted),
    ).href;
    const previous = fixture.template.observation.evaluatedModuleURL;
    fixture.template.observation = observation;
    const row = observation.bootstrap.emitted;
    fixture.template.roster = fixture.template.roster.map((member) =>
      member.url === previous
        ? {
            url: observation.evaluatedModuleURL,
            sha256: row.sha256,
            byteLength: row.byteLength,
            moduleKind: 'commonjs',
          }
        : member,
    );
    fixture.template.requiredEvaluationURLs[2] = observation.evaluatedModuleURL;
    fixtures.set(composition.id, fixture);
  }
});
after(() => rmSync(root, { recursive: true, force: true }));

test('closed own-property roster preserves all six exact factories and root-module relations', () => {
  assert.deepEqual(
    httpCompositionIds(),
    expectedRoots.map((row) => row.id),
  );
  const ids = httpCompositionIds();
  ids.splice(0);
  assert.deepEqual(
    httpCompositionIds(),
    expectedRoots.map((row) => row.id),
  );
  for (const composition of expectedRoots) {
    assert.equal(isHttpComposition(composition.id), true);
    const actual = httpComposition(composition.id);
    assert.deepEqual(actual, composition);
    assert.equal(Object.isFrozen(actual), true);
    assert.throws(() => {
      actual.rootModule = expectedRoots.find((row) => row.id !== actual.id).rootModule;
    }, TypeError);
    assert.deepEqual(httpComposition(composition.id), composition);
  }
});
for (const id of [
  'unknown',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  'Reference',
  'offlinee6',
  'offlinectg9',
  'reference/',
  './reference',
  '../reference',
  'privacy\0',
  '',
  null,
  {},
  ['reference'],
]) {
  test(`closed roster refuses nonmember ${JSON.stringify(id)} without coercion`, () => {
    assert.equal(isHttpComposition(id), false);
    assert.throws(() => httpComposition(id), { code: 'HTTP_COMPOSITION_INVALID' });
  });
}
test('root selection does not invoke caller coercion or proxy property access', () => {
  let calls = 0;
  const value = new Proxy(
    {
      toString() {
        calls++;
        return 'reference';
      },
    },
    {
      get() {
        calls++;
        throw new Error('caller executed');
      },
    },
  );
  assert.equal(isHttpComposition(value), false);
  assert.throws(() => httpComposition(value), { code: 'HTTP_COMPOSITION_INVALID' });
  assert.equal(calls, 0);
});

function terminal(expected, observation = expected.bindings.observation) {
  return {
    schemaVersion: 1,
    kind: 'terminal',
    nonce: expected.nonce,
    candidateCommit: expected.candidateCommit,
    pid: expected.pid,
    result: {
      observation: structuredClone(observation),
      modules: moduleFacts(expected),
      trustedBootstrap: structuredClone(expected.bindings.trustedBootstrap),
      readinessPromoting: false,
      runtimeCustodyComplete: false,
    },
  };
}
function start(expected) {
  return {
    schemaVersion: 1,
    kind: 'start',
    nonce: expected.nonce,
    candidateCommit: expected.candidateCommit,
    pid: expected.pid,
    result: {
      mode: expected.mode,
      resolutionAnchors: structuredClone(expected.bindings.resolutionAnchors),
    },
  };
}
for (const composition of expectedRoots) {
  test(`${composition.id}: actual compiler factory export and native map retain nonqualifying limits`, () => {
    const value = observations.get(composition.id);
    assert.equal(value.compositionId, composition.id);
    assert.equal(value.actualNamedExportObserved, true);
    assert.equal(value.namedExport, 'createReferenceApplication');
    assert.equal(
      value.bootstrap.source.sha256,
      hash(readFileSync(join(repository, composition.source))),
    );
    assert.equal(value.bootstrap.emitted.path, composition.emitted);
    assert.equal(value.bootstrap.map.path, `${composition.emitted}.map`);
    assert.equal(value.factoryInvoked, false);
    for (const field of [
      'constructorProvenance',
      'sourceMapFunctionCorrespondence',
      'applicationRoot',
      'middleware',
      'reachability',
    ])
      assert.equal(value[field], 'UNVERIFIED');
    assert.equal(value.runtimeCustodyComplete, false);
    assert.equal(value.readinessPromoting, false);
    const source = ts.createSourceFile(
      composition.source,
      readFileSync(join(repository, composition.source), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const imports = [],
      calls = [];
    function visit(node) {
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword)
        imports.push(node.arguments[0].text);
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.expression.getText(source) === 'NestFactory' &&
        node.expression.name.text === 'create'
      )
        calls.push(node);
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].arguments[0].getText(source), composition.rootExport);
    const expectedImport = `./${composition.rootModule.split('/').at(-1).replace(/\.ts$/u, '.js')}`;
    assert.equal(imports.includes(expectedImport), true);
    assert.equal(
      resolve(
        dirname(join(repository, composition.source)),
        expectedImport.replace(/\.js$/u, '.ts'),
      ),
      join(repository, composition.rootModule),
    );
    const moduleSource = ts.createSourceFile(
      composition.rootModule,
      readFileSync(join(repository, composition.rootModule), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    assert.equal(
      moduleSource.statements.filter(
        (node) =>
          ts.isClassDeclaration(node) &&
          node.name?.text === composition.rootExport &&
          node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
      ).length,
      1,
    );
  });
  test(`${composition.id}: exact parser context accepts all three controls without runtime credit`, () => {
    const expected = fixtures.get(composition.id).context();
    assert.deepEqual(
      expected.bindings.trustedBootstrap.map((row) => row.path),
      [
        'scripts/lib/http-composition-roster.mjs',
        'scripts/lib/http-runtime-worker.mjs',
        'scripts/lib/http-module-custody.mjs',
      ],
    );
    const protocol = createHttpRuntimeProtocol(expected);
    assert.equal(protocol.receive(start(expected)), true);
    const end = terminal(expected);
    assert.equal(protocol.receive(end), true);
    assert.deepEqual(protocol.finish({ code: 0, signal: null }), end.result);
    assert.equal(protocol.snapshot().processCustodyQualified, false);
    assert.equal(protocol.snapshot().readinessPromoting, false);
  });
  for (const other of expectedRoots.filter((row) => row.id !== composition.id)) {
    test(`${composition.id}: refuses ${other.id} source/output/map substitution before import`, async () => {
      for (const [field, path] of [
        ['source', other.source],
        ['emitted', other.emitted],
        ['map', `${other.emitted}.map`],
      ]) {
        const value = job(join(root, composition.id), composition);
        value.bootstrap[field].path = path;
        await assert.rejects(observeReferenceBootstrapModule(value), {
          code: 'HTTP_RUNTIME_BINDING_INVALID',
        });
      }
      const expected = fixtures.get(composition.id).context();
      const protocol = createHttpRuntimeProtocol(expected);
      assert.equal(protocol.receive(start(expected)), true);
      const end = terminal(expected);
      end.result.observation.compositionId = other.id;
      assert.equal(protocol.receive(end), false);
      assert.equal(protocol.receive(terminal(expected)), false);
      assert.throws(() => protocol.finish({ code: 0, signal: null }), {
        code: 'HTTP_RUNTIME_PROTOCOL_INVALID',
      });
    });
  }
}
for (const [label, mutate] of [
  [
    'source wrong case',
    (value) => {
      value.bootstrap.source.path = 'reference/api/src/Bootstrap.ts';
    },
  ],
  [
    'emitted parent traversal',
    (value) => {
      value.bootstrap.emitted.path = `./${value.bootstrap.emitted.path}`;
    },
  ],
  [
    'absolute map',
    (value) => {
      value.bootstrap.map.path = join(root, value.bootstrap.map.path);
    },
  ],
  [
    'root module as factory',
    (value) => {
      value.bootstrap.source.path = expectedRoots[0].rootModule;
    },
  ],
  [
    'changed source digest',
    (value) => {
      value.bootstrap.source.sha256 = '0'.repeat(64);
    },
  ],
  [
    'changed emitted digest',
    (value) => {
      value.bootstrap.emitted.sha256 = '0'.repeat(64);
    },
  ],
  [
    'changed map digest',
    (value) => {
      value.bootstrap.map.sha256 = '0'.repeat(64);
    },
  ],
  [
    'changed map length',
    (value) => {
      value.bootstrap.map.byteLength++;
    },
  ],
  [
    'changed file permissions',
    (value) => {
      value.bootstrap.emitted.permissions ^= 0o100;
    },
  ],
]) {
  test(`runtime byte binding refuses ${label}`, async () => {
    const value = job(join(root, 'reference'), expectedRoots[0]);
    mutate(value);
    await assert.rejects(observeReferenceBootstrapModule(value), {
      code: 'HTTP_RUNTIME_BINDING_INVALID',
    });
  });
}
for (const [label, mutate] of [
  [
    'missing trusted roster control',
    (b) => {
      b.trustedBootstrap.shift();
    },
  ],
  [
    'extra trusted roster control',
    (b) => {
      b.trustedBootstrap.push(structuredClone(b.trustedBootstrap[0]));
    },
  ],
  [
    'reordered trusted roster controls',
    (b) => {
      b.trustedBootstrap.reverse();
    },
  ],
  [
    'changed trusted roster digest',
    (b) => {
      b.trustedBootstrap[0].sha256 = '0'.repeat(64);
    },
  ],
  [
    'missing roster module',
    (b) => {
      b.roster = b.roster.filter((row) => !row.url.endsWith('/http-composition-roster.mjs'));
    },
  ],
  [
    'changed roster module bytes',
    (b) => {
      b.roster.find((row) => row.url.endsWith('/http-composition-roster.mjs')).sha256 = '0'.repeat(
        64,
      );
    },
  ],
  [
    'duplicated roster member',
    (b) => {
      b.roster.push(structuredClone(b.roster[0]));
    },
  ],
]) {
  test(`trusted parser controls refuse ${label} before frames`, () => {
    const expected = fixtures.get('reference').context();
    mutate(expected.bindings);
    assert.throws(() => createHttpRuntimeProtocol(expected), {
      code: 'HTTP_RUNTIME_PROTOCOL_INVALID',
    });
  });
}
test('trusted roster tamper after start is sticky at final admission', () => {
  const expected = fixtures.get('reference').context();
  const protocol = createHttpRuntimeProtocol(expected);
  assert.equal(protocol.receive(start(expected)), true);
  const end = terminal(expected);
  end.result.trustedBootstrap[0].sha256 = '0'.repeat(64);
  assert.equal(protocol.receive(end), false);
  assert.equal(protocol.receive(terminal(expected)), false);
  assert.throws(() => protocol.finish({ code: 0, signal: null }), {
    code: 'HTTP_RUNTIME_PROTOCOL_INVALID',
  });
  assert.equal(protocol.snapshot().refused, true);
  assert.equal(protocol.snapshot().readinessPromoting, false);
});
test('historical reference bootstrap bytes and factory identity remain exact', () => {
  assert.equal(
    hash(readFileSync(join(repository, expectedRoots[0].source))),
    'ae8bb32ba4e6598b72488ee65a64046db2535db486588b775deb69deac7c7553',
  );
  assert.deepEqual(httpComposition('reference'), expectedRoots[0]);
});

for (const [label, mutation] of [
  [
    'wrong emitted filename',
    (map) => {
      map.file = 'other.js';
    },
  ],
  [
    'cross-root source relation',
    (map) => {
      map.sources = ['../../../../src/performance/privacy.ts'];
    },
  ],
  [
    'extra source relation',
    (map) => {
      map.sources.push(map.sources[0]);
    },
  ],
  [
    'empty mapping body',
    (map) => {
      map.mappings = '';
    },
  ],
  [
    'foreign source root',
    (map) => {
      map.sourceRoot = '/foreign';
    },
  ],
]) {
  test(`actual installed-compiler map refuses ${label} even with correctly rebound altered bytes`, async () => {
    const composition = expectedRoots[0];
    const checkout = join(root, composition.id);
    const file = join(checkout, `${composition.emitted}.map`);
    const original = readFileSync(file);
    try {
      const map = JSON.parse(original);
      mutation(map);
      writeFileSync(file, JSON.stringify(map));
      const value = job(checkout, composition);
      assert.notEqual(value.bootstrap.map.sha256, hash(original));
      await assert.rejects(observeReferenceBootstrapModule(value), {
        code: 'HTTP_RUNTIME_BINDING_INVALID',
      });
    } finally {
      writeFileSync(file, original);
    }
    assert.equal(
      (await observeReferenceBootstrapModule(job(checkout, composition))).actualNamedExportObserved,
      true,
    );
  });
}
