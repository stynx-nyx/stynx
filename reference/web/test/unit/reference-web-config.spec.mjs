import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(appRoot, relativePath), 'utf8'));
}

function readText(relativePath) {
  return readFileSync(join(appRoot, relativePath), 'utf8');
}

test('reference-web package scripts point at local build and runtime inputs', () => {
  const pkg = readJson('package.json');

  assert.equal(pkg.scripts.build, 'tsc -p tsconfig.json');
  assert.equal(pkg.scripts['build:web'], 'node scripts/build-web.mjs');
  assert.equal(pkg.scripts.serve, 'node scripts/serve-static.mjs');
  assert.equal(
    pkg.scripts['test:e2e'],
    'node ../../scripts/run-and-record.mjs --package @stynx/reference-web --level e2e --runner playwright -- playwright test',
  );

  for (const relativePath of [
    'scripts/build-web.mjs',
    'scripts/serve-static.mjs',
    'src/main.ts',
    'src/web/index.html',
  ]) {
    assert.ok(existsSync(join(appRoot, relativePath)), `${relativePath} must exist`);
  }
});

test('reference-web tsconfig stays on the shared Angular preset', () => {
  const tsconfig = readJson('tsconfig.json');

  assert.equal(tsconfig.extends, '../../tools/tsconfig/angular18.json');
  assert.equal(tsconfig.compilerOptions.outDir, 'dist');
  assert.equal(tsconfig.compilerOptions.rootDir, '../..');
  assert.equal(tsconfig.compilerOptions.experimentalDecorators, true);
  assert.equal(tsconfig.compilerOptions.emitDecoratorMetadata, true);
  assert.deepEqual(tsconfig.compilerOptions.types, ['node']);
  assert.ok(tsconfig.include.includes('src/**/*.ts'));
});

test('reference-web build script bundles the app entry and web-package aliases', () => {
  const pkg = readJson('package.json');
  const buildScript = readText('scripts/build-web.mjs');

  assert.match(buildScript, /entryFile = path\.resolve\(appRoot, 'src\/main\.ts'\)/u);
  assert.match(buildScript, /indexSrc = path\.resolve\(appRoot, 'src\/web\/index\.html'\)/u);
  assert.match(buildScript, /outfile: path\.resolve\(outDir, 'main\.js'\)/u);

  const webDependencies = Object.keys(pkg.dependencies)
    .filter((name) => name.startsWith('@stynx-web/'))
    .sort();
  for (const dependencyName of webDependencies) {
    assert.match(buildScript, new RegExp(`'${dependencyName}':`, 'u'), `${dependencyName} needs an esbuild alias`);
  }
});
