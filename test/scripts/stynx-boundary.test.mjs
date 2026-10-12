import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const verifier = fileURLToPath(new URL('../../scripts/verify-stynx-boundary.ts', import.meta.url));
const approved = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url))).stynx
  .boundary.allowedPackages;
const exactDemo = approved.find((entry) => entry.startsWith('@stynx-domain/'));

for (const [name, specifier, permitted] of [
  ['exact reviewed private demo module', exactDemo, true],
  ['retained canonical package namespace', '@stynx-nyx/core/deep-entry', true],
  [
    'unreviewed sibling private module',
    exactDemo.replace('demo-bookmark.module.js', 'sibling.module.js'),
    false,
  ],
  ['suffix of exact reviewed private module', `${exactDemo}.suffix`, false],
]) {
  test(`actual boundary CLI ${permitted ? 'admits' : 'refuses'} ${name}`, (t) => {
    const root = mkdtempSync(join(tmpdir(), 'stynx boundary espaço 日本語 '));
    t.after(() => rmSync(root, { recursive: true, force: false }));
    mkdirSync(join(root, 'src'));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({
        name: 'inspector-boundary-fixture',
        stynx: { boundary: { roots: ['src'], allowedPackages: approved } },
      }),
    );
    writeFileSync(join(root, 'src/entry.ts'), `import { module } from '${specifier}';\n`);
    const result = spawnSync(process.execPath, ['--experimental-strip-types', verifier], {
      cwd: root,
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C', LC_ALL: 'C' },
    });
    assert.equal(result.signal, null);
    assert.equal(result.error, undefined);
    assert.equal(result.status, permitted ? 0 : 1, result.stderr);
    if (permitted) assert.match(result.stdout, /boundary verification passed: 1 files/);
    else {
      assert.match(result.stderr, /imports undeclared STYNX seam/);
      assert(result.stderr.includes(specifier));
    }
  });
}
