import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { normalizePublicApiDeclaration } from '../../packages/cli/engines/public-api-declaration.mjs';
import {
  currentBaselines,
  compareBaselines,
  discoverPackages,
} from '../../packages/cli/engines/public-api-baselines.mjs';

const storage = {
  packageName: '@stynx-nyx/outbox',
  declarationPath: 'outbox/src/storage-template.generated.d.ts',
  packageVersion: '1.5.7',
  source:
    'export declare const OUTBOX_STORAGE_TEMPLATE: {\n    readonly packageVersion: "1.5.7";\n};',
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-api-baseline-native-'));
  try {
    return run(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
function file(root, path, value) {
  const target = join(root, path);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, value);
}

test('nonstorage declaration normalization ignores native version values without coercion', () => {
  const sentinel = new Error('must not coerce nonstorage version');
  const opaque = {
    [Symbol.toPrimitive]() {
      throw sentinel;
    },
  };
  for (const packageVersion of [undefined, null, 17, Symbol('version'), opaque]) {
    assert.equal(
      normalizePublicApiDeclaration({
        packageName: '@fixture/plain',
        declarationPath: 'index.d.ts',
        packageVersion,
        source: '  export declare const value: string;\r\n',
      }),
      'export declare const value: string;',
    );
  }
});

test('storage version uses native string-hint coercion before strict literal mismatch', () => {
  const trace = [];
  const version = {
    [Symbol.toPrimitive](hint) {
      assert.equal(this, version);
      trace.push(hint);
      return '1.5.7';
    },
  };
  assert.throws(
    () => normalizePublicApiDeclaration({ ...storage, packageVersion: version }),
    /invalid or stale storage version declaration/u,
  );
  assert.deepEqual(trace, ['string']);
});

test('storage version retains thrown coercion identity', () => {
  const sentinel = new Error('native version conversion sentinel');
  const trace = [];
  const version = {
    [Symbol.toPrimitive](hint) {
      trace.push(hint);
      throw sentinel;
    },
  };
  assert.throws(
    () => normalizePublicApiDeclaration({ ...storage, packageVersion: version }),
    (error) => error === sentinel,
  );
  assert.deepEqual(trace, ['string']);
});

test('storage version retains native Symbol refusal', () => {
  assert.throws(
    () => normalizePublicApiDeclaration({ ...storage, packageVersion: Symbol('version') }),
    TypeError,
  );
});

test('storage declaration structure refuses before version coercion', () => {
  let reads = 0;
  const version = {
    [Symbol.toPrimitive]() {
      reads += 1;
      throw new Error('unreachable version conversion');
    },
  };
  assert.throws(
    () =>
      normalizePublicApiDeclaration({
        ...storage,
        packageVersion: version,
        source: 'export declare const wrong: string;',
      }),
    /invalid or stale storage version declaration/u,
  );
  assert.equal(reads, 0);
});

for (const [name, version] of [
  ['omitted', undefined],
  ['null', null],
  ['number', 17],
  ['object', { value: true }],
]) {
  test(`actual nonstorage baseline hashes declarations with ${name} manifest version`, () =>
    fixture((root) => {
      const exports = { '.': { types: './dist/index.d.ts' }, extra: 17 };
      file(
        root,
        'packages/plain/package.json',
        JSON.stringify({
          name: '@fixture/plain',
          scripts: { build: 'fixture' },
          exports,
          ...(version === undefined ? {} : { version }),
        }),
      );
      file(root, 'packages/plain/dist/index.d.ts', 'export declare const value: string;\r\n');
      assert.deepEqual(
        currentBaselines(root, [{ name: '@fixture/plain', dir: 'packages/plain' }]),
        {
          schemaVersion: '1',
          packages: {
            '@fixture/plain': {
              exports,
              declarationHashes: { 'index.d.ts': hash('export declare const value: string;') },
            },
          },
        },
      );
    }));
}

test('actual package discovery retains strict private flag, scalar skips and name sorting', () =>
  fixture((root) => {
    const values = {
      z: { name: 'z' },
      a: { name: 'a', private: 'true' },
      private: { name: 'private', private: true },
      wrong: { name: 17 },
      scalar: 17,
      empty: { name: '' },
    };
    for (const [directory, value] of Object.entries(values))
      file(root, `packages/${directory}/package.json`, JSON.stringify(value));
    assert.deepEqual(discoverPackages(root, ['missing', 'packages']), [
      { name: '', dir: 'packages/empty' },
      { name: 'a', dir: 'packages/a' },
      { name: 'z', dir: 'packages/z' },
    ]);
  }));

test('actual package discovery retains native null-manifest error', () =>
  fixture((root) => {
    file(root, 'packages/null/package.json', 'null');
    assert.throws(() => discoverPackages(root, ['packages']), TypeError);
  }));

test('baseline comparison preserves missing, changed, added, removed and export failure order', () => {
  const specs = [
    { name: 'missing', dir: 'unused' },
    { name: 'fixture', dir: 'unused' },
  ];
  const current = {
    schemaVersion: '1',
    packages: {
      missing: { declarationHashes: {}, exports: {} },
      fixture: {
        declarationHashes: { 'changed.d.ts': 'new', 'added.d.ts': 'added' },
        exports: { '.': 'new' },
      },
    },
  };
  const expected = {
    packages: {
      fixture: {
        declarationHashes: { 'changed.d.ts': 'old', 'removed.d.ts': 'removed' },
        exports: { '.': 'old' },
      },
    },
  };
  assert.deepEqual(compareBaselines(expected, current, specs), [
    'missing: missing baseline entry',
    'fixture: public declaration changed changed.d.ts',
    'fixture: new public declaration added.d.ts',
    'fixture: removed public declaration removed.d.ts',
    'fixture: package exports changed',
  ]);
  assert.deepEqual(compareBaselines(17, current, specs), [
    'missing: missing baseline entry',
    'fixture: missing baseline entry',
  ]);
  assert.throws(() => compareBaselines(null, current, specs), TypeError);
});

test('unbuilt preset baseline retains exact source bytes and parsed exports', () =>
  fixture((root) => {
    const exports = ['unusual', { kept: true }];
    file(
      root,
      'packages/config/package.json',
      JSON.stringify({ name: '@fixture/config', exports }),
    );
    file(root, 'packages/config/z.json', '{"strict":true}\n');
    file(root, 'packages/config/a.mjs', 'export default {};\n');
    file(root, 'packages/config/ignored.txt', 'not a preset');
    assert.deepEqual(
      currentBaselines(root, [{ name: '@fixture/config', dir: 'packages/config' }]),
      {
        schemaVersion: '1',
        packages: {
          '@fixture/config': {
            exports,
            declarationHashes: {
              'a.mjs': hash('export default {};\n'),
              'z.json': hash('{"strict":true}\n'),
            },
          },
        },
      },
    );
  }));
