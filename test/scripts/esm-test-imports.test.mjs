import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { resolveTestImport, resolveTestImportPath } from './support/esm-test-imports.mjs';

test('test import resolution retains each package owner and selects ESM conditions', async () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx ESM anchors 日本語 ')));
  try {
    for (const owner of ['first', 'second']) {
      const packageRoot = join(root, owner, 'node_modules/dual');
      mkdirSync(packageRoot, { recursive: true });
      writeFileSync(join(packageRoot, 'package.json'), JSON.stringify({
        name: 'dual', type: 'module',
        exports: { '.': { import: './import.mjs', require: './require.cjs' }, './package.json': './package.json' },
      }));
      writeFileSync(join(packageRoot, 'import.mjs'), `export const owner = ${JSON.stringify(owner)};`);
      writeFileSync(join(packageRoot, 'require.cjs'), 'throw new Error("wrong loader condition");');
      const anchor = join(root, owner, 'package.json');
      writeFileSync(anchor, '{"type":"module"}');
      const resolved = resolveTestImport('dual', anchor);
      assert.equal(resolved, pathToFileURL(join(packageRoot, 'import.mjs')).href);
      assert.equal(resolveTestImport('dual', pathToFileURL(anchor)), resolved);
      assert.equal((await import(resolved)).owner, owner);
      assert.equal(resolveTestImportPath('dual/package.json', anchor), join(packageRoot, 'package.json'));
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
