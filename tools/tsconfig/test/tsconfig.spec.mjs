import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function readJson(fileName) {
  return JSON.parse(readFileSync(join(packageRoot, fileName), 'utf8'));
}

test('all exported tsconfig presets are valid JSON files', () => {
  const jsonFiles = readdirSync(packageRoot).filter((fileName) => fileName.endsWith('.json')).sort();

  assert.deepEqual(jsonFiles, ['angular18.json', 'base.json', 'lib.json', 'node24.json', 'package.json']);
  for (const fileName of jsonFiles) {
    assert.doesNotThrow(() => readJson(fileName), `${fileName} should parse as JSON`);
  }
});

test('preset extends entries resolve to local preset files', () => {
  for (const fileName of ['angular18.json', 'lib.json', 'node24.json']) {
    const config = readJson(fileName);
    assert.match(config.extends, /^\.\//u, `${fileName} should extend a local preset`);

    const target = resolve(packageRoot, config.extends);
    assert.ok(target.startsWith(packageRoot), `${fileName} should not extend outside the package`);
    assert.ok(existsSync(target), `${fileName} extends ${config.extends}, which must exist`);
  }
});

test('compiler-option invariants match STYNX package policy', () => {
  const base = readJson('base.json');
  assert.equal(base.compilerOptions.target, 'ES2022');
  assert.equal(base.compilerOptions.module, 'NodeNext');
  assert.equal(base.compilerOptions.moduleResolution, 'NodeNext');
  assert.equal(base.compilerOptions.strict, true);
  assert.equal(base.compilerOptions.isolatedModules, true);
  assert.equal(base.compilerOptions.noUncheckedIndexedAccess, true);
  assert.equal(base.compilerOptions.exactOptionalPropertyTypes, true);
  assert.equal(base.compilerOptions.forceConsistentCasingInFileNames, true);
  assert.equal(base.compilerOptions.resolveJsonModule, true);

  const node24 = readJson('node24.json');
  assert.equal(node24.extends, './base.json');
  assert.deepEqual(node24.compilerOptions.lib, ['ES2022']);
  assert.deepEqual(node24.compilerOptions.types, ['node']);

  const angular18 = readJson('angular18.json');
  assert.equal(angular18.extends, './base.json');
  assert.equal(angular18.compilerOptions.module, 'ES2022');
  assert.equal(angular18.compilerOptions.moduleResolution, 'Bundler');
  assert.ok(angular18.compilerOptions.lib.includes('DOM'));
  assert.deepEqual(angular18.compilerOptions.types, []);

  const lib = readJson('lib.json');
  assert.equal(lib.extends, './node24.json');
  assert.deepEqual(lib.include, ['src/**/*.ts']);
});
