import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { normalizePublicApiDeclaration } from '../../scripts/lib/public-api-declaration.mjs';

const root = resolve(import.meta.dirname, '../..');
const packages = ['offline-sync', 'outbox'];
function emit(source) {
  const result = ts.transpileDeclaration(source, {
    fileName: 'storage-template.generated.ts',
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext },
  });
  assert.deepEqual(result.diagnostics, []);
  return result.outputText;
}
function fixture(directory, version = '1.5.7') {
  const source = readFileSync(
    resolve(root, `packages/${directory}/src/storage-template.generated.ts`),
    'utf8',
  ).replace(/^  packageVersion: '[^']+',$/mu, `  packageVersion: '${version}',`);
  return {
    packageName: `@stynx-nyx/${directory}`,
    declarationPath: `${directory}/src/storage-template.generated.d.ts`,
    packageVersion: version,
    source: emit(source),
  };
}
const hash = (input) =>
  createHash('sha256').update(normalizePublicApiDeclaration(input)).digest('hex');

for (const directory of packages) {
  test(`${directory} actual TypeScript declaration changes only metadata hash across release versions`, () => {
    const before = fixture(directory);
    const after = fixture(directory, '1.6.0');
    assert.notEqual(before.source, after.source);
    assert.equal(hash(before), hash(after));
    assert.equal(
      normalizePublicApiDeclaration(before),
      before.source
        .trim()
        .replace(
          '    readonly packageVersion: "1.5.7";',
          '    readonly packageVersion: "__STYNX_PACKAGE_VERSION_METADATA__";',
        ),
    );
    assert.equal(hash({ ...before, source: before.source.replace(/\n/gu, '\r\n') }), hash(before));
  });
  for (const [name, mutate] of [
    [
      'stale manifest version',
      (value) => {
        value.packageVersion = '1.6.0';
      },
    ],
    [
      'wrong literal',
      (value) => {
        value.source = value.source.replace(
          'readonly packageVersion: "1.5.7"',
          'readonly packageVersion: "1.5.6"',
        );
      },
    ],
    [
      'missing literal',
      (value) => {
        value.source = value.source.replace(/^    readonly packageVersion:.*\n/mu, '');
      },
    ],
    [
      'duplicate literal',
      (value) => {
        value.source += '\n    readonly packageVersion: "1.5.7";';
      },
    ],
    [
      'nested duplicate literal',
      (value) => {
        value.source += '\nexport declare const duplicate: { readonly packageVersion: "1.5.7"; };';
      },
    ],
    [
      'malformed indentation',
      (value) => {
        value.source = value.source.replace(
          '    readonly packageVersion:',
          '  readonly packageVersion:',
        );
      },
    ],
    [
      'narrowed general string type',
      (value) => {
        value.source = value.source.replace(
          'readonly packageVersion: "1.5.7"',
          'readonly packageVersion: string',
        );
      },
    ],
    [
      'wrong exported declaration',
      (value) => {
        value.source = value.source.replace('STORAGE_TEMPLATE', 'STORAGE_OTHER');
      },
    ],
    [
      'malformed manifest version',
      (value) => {
        value.packageVersion = '01.5.7';
      },
    ],
  ])
    test(`${directory} API metadata refuses ${name}`, () => {
      const value = fixture(directory);
      mutate(value);
      assert.throws(
        () => normalizePublicApiDeclaration(value),
        /invalid or stale storage version declaration/u,
      );
    });
  for (const [name, mutate] of [
    [
      'contract version',
      (source) =>
        source.replace('readonly contractVersion: "1.0.0"', 'readonly contractVersion: "2.0.0"'),
    ],
    [
      'SQL type',
      (source) => source.replace('FORCE ROW LEVEL SECURITY', 'DISABLE ROW LEVEL SECURITY'),
    ],
    [
      'source digest',
      (source) =>
        source.replace(/readonly sha256: "[0-9a-f]{64}"/u, `readonly sha256: "${'0'.repeat(64)}"`),
    ],
    [
      'binding shape',
      (source) => source.replace('readonly bindings:', 'readonly renamedBindings:'),
    ],
    ['additional export', (source) => `${source}\nexport declare const UNREVIEWED: string;\n`],
  ])
    test(`${directory} API hash retains ${name} changes`, () => {
      const value = fixture(directory);
      const changed = mutate(value.source);
      assert.notEqual(changed, value.source, 'mutation must target actual emitted declaration');
      assert.notEqual(hash({ ...value, source: changed }), hash(value));
    });
  for (const overrides of [
    { packageName: '@stynx-nyx/core' },
    { packageName: `@stynx-nyx/${directory}-suffix` },
    { declarationPath: `${directory}/src/storage-template.generated.d.ts.suffix` },
    { declarationPath: `${directory}/src/storage-catalog.generated.d.ts` },
    { declarationPath: `other/${directory}/src/storage-template.generated.d.ts` },
    { packageName: `@stynx-nyx/${directory === 'outbox' ? 'offline-sync' : 'outbox'}` },
  ])
    test(`${directory} normal metadata hashing is retained outside exact tuple ${JSON.stringify(overrides)}`, () => {
      const before = { ...fixture(directory), ...overrides };
      const after = { ...fixture(directory, '1.6.0'), ...overrides };
      assert.equal(normalizePublicApiDeclaration(before), before.source.trim());
      assert.notEqual(hash(before), hash(after));
    });
}
