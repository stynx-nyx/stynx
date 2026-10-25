import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import {
  readBoundaryConfig,
  verifyStynxBoundary,
} from '../../packages/cli/engines/stynx-boundary.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'stynx-native-boundary-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (name, value) => {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
  };
  return { root, write };
}
const parsed = (value) => JSON.parse(JSON.stringify(value));

test('native boundary config preserves rc precedence, package opt-in and nullish defaults', (t) => {
  const { root, write } = fixture(t);
  write('package.json', JSON.stringify({ stynx: { boundary: { roots: ['package'] } } }));
  assert.equal(readBoundaryConfig(root), null);
  assert.deepEqual(readBoundaryConfig(root, { allowPackageJson: true }), {
    source: 'package.json',
    config: { roots: ['package'] },
  });
  write('.stynxrc.json', JSON.stringify({ boundary: { roots: ['rc'], extra: 42 } }));
  assert.deepEqual(readBoundaryConfig(root, { allowPackageJson: true }), {
    source: '.stynxrc.json',
    config: { roots: ['rc'], extra: 42 },
  });
  write('.stynxrc.json', JSON.stringify({ boundary: null }));
  assert.deepEqual(readBoundaryConfig(root), { source: '.stynxrc.json', config: {} });
});

test('native boundary config boxes JSON scalars and retains null document failure', (t) => {
  const { root, write } = fixture(t);
  write('.stynxrc.json', '7');
  assert.deepEqual(readBoundaryConfig(root), { source: '.stynxrc.json', config: {} });
  assert.deepEqual(verifyStynxBoundary(root, parsed(7)), {
    roots: ['reference', 'domain', 'packages', 'packages-web'],
    scanned: [],
    seams: [],
    violations: [],
  });
  write('.stynxrc.json', 'null');
  assert.throws(() => readBoundaryConfig(root), TypeError);
  assert.throws(() => verifyStynxBoundary(root, parsed(null)), TypeError);
});

test('native forbidden prefixes retain number, null and object interpolation', (t) => {
  const { root, write } = fixture(t);
  write(
    'src/a.ts',
    "import x from '7/a';\nimport y from 'null/b';\nimport z from '[object Object]/c';\n",
  );
  const result = verifyStynxBoundary(
    root,
    parsed({ roots: ['src'], forbiddenImports: [7, null, {}] }),
  );
  assert.deepEqual(result.violations, [
    {
      kind: 'forbidden',
      file: 'src/a.ts',
      line: 1,
      specifier: '7/a',
      message: 'src/a.ts imports forbidden 7/a',
    },
    {
      kind: 'forbidden',
      file: 'src/a.ts',
      line: 2,
      specifier: 'null/b',
      message: 'src/a.ts imports forbidden null/b',
    },
    {
      kind: 'forbidden',
      file: 'src/a.ts',
      line: 3,
      specifier: '[object Object]/c',
      message: 'src/a.ts imports forbidden [object Object]/c',
    },
  ]);
});

test('native required seams preserve string iteration, scalar keys and dependency spreading', (t) => {
  const { root, write } = fixture(t);
  write('package.json', JSON.stringify({ dependencies: 'x', devDependencies: { 7: true } }));
  assert.deepEqual(
    verifyStynxBoundary(root, parsed({ roots: [], requireStynxPackages: '01' })).violations,
    [
      {
        kind: 'required-seam-absent',
        file: 'package.json',
        line: 1,
        specifier: '1',
        message: 'required STYNX package seam is absent: 1',
      },
    ],
  );
  assert.deepEqual(
    verifyStynxBoundary(root, parsed({ roots: [], requireStynxPackages: [7, null] })).violations,
    [
      {
        kind: 'required-seam-absent',
        file: 'package.json',
        line: 1,
        specifier: null,
        message: 'required STYNX package seam is absent: null',
      },
    ],
  );
});

test('native allowed entries remain lazy until a STYNX import consumes endsWith', (t) => {
  const { root, write } = fixture(t);
  const config = parsed({ roots: ['src'], allowedPackages: [7] });
  write('src/a.ts', "import x from 'ordinary';\n");
  assert.deepEqual(verifyStynxBoundary(root, config).violations, []);
  write('src/a.ts', "import x from '@stynx-nyx/core';\n");
  assert.throws(() => verifyStynxBoundary(root, config), TypeError);
});

test('native scanner preserves default directories, exclusions, extension and import line census', (t) => {
  const { root, write } = fixture(t);
  write('domain/a.cts', "export const a = 1;\nimport x from '@stynx-nyx/z';\n");
  write('domain/b.mts', "const b = import('@stynx-nyx/a/deep');\n");
  write('domain/c.tsx', "import x from '@stynx-nyx/a';\n");
  write('domain/d.txt', "import x from 'forbidden/path';\n");
  for (const directory of ['dist', 'coverage', 'node_modules'])
    write(`domain/${directory}/skip.ts`, "import x from 'forbidden/path';\n");
  const result = verifyStynxBoundary(
    root,
    parsed({ forbiddenImports: ['@stynx-nyx/z', 'forbidden'] }),
  );
  assert.deepEqual(result.scanned, ['domain/a.cts', 'domain/b.mts', 'domain/c.tsx']);
  assert.deepEqual(result.seams, ['@stynx-nyx/a', '@stynx-nyx/z']);
  assert.deepEqual(result.violations, [
    {
      kind: 'forbidden',
      file: 'domain/a.cts',
      line: 2,
      specifier: '@stynx-nyx/z',
      message: 'domain/a.cts imports forbidden @stynx-nyx/z',
    },
  ]);
});

test('native path argument error precedes package JSON and later policy consumption', (t) => {
  const { root, write } = fixture(t);
  write('package.json', '{');
  assert.throws(
    () =>
      verifyStynxBoundary(
        root,
        parsed({ roots: [7], allowedPackages: 7, requireStynxPackages: 7 }),
      ),
    (error) => error instanceof TypeError && error.code === 'ERR_INVALID_ARG_TYPE',
  );
  assert.throws(
    () => verifyStynxBoundary(root, parsed({ roots: [], requireStynxPackages: 7 })),
    SyntaxError,
  );
});

test('native required iteration is evaluated after file imports and keeps noniterable refusal', (t) => {
  const { root, write } = fixture(t);
  write('src/a.ts', "import x from 'ordinary';\n");
  assert.throws(
    () => verifyStynxBoundary(root, parsed({ roots: ['src'], requireStynxPackages: 7 })),
    TypeError,
  );
  assert.deepEqual(
    verifyStynxBoundary(
      root,
      parsed({ roots: ['absent'], allowedPackages: 7, forbiddenImports: 7 }),
    ).scanned,
    [],
  );
});
