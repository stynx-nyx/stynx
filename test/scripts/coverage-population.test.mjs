import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { BaseCoverageProvider } from 'vitest/node';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

function fixture(run, index = "export { service } from './service';\n") {
  const packageDir = mkdtempSync(join(tmpdir(), 'stynx coverage população-'));
  try {
    mkdirSync(join(packageDir, 'src'), { recursive: true });
    if (index !== null) writeFileSync(join(packageDir, 'src/index.ts'), index);
    writeFileSync(join(packageDir, 'src/service.ts'), 'export function service() { return 1; }\n');
    return run(packageDir);
  } finally {
    rmSync(packageDir, { recursive: true, force: true });
  }
}

function matcher(packageDir, coverage) {
  const provider = new BaseCoverageProvider();
  provider.options = { ...coverage, allowExternal: false };
  provider.roots = [packageDir];
  return (path) => provider.isIncluded(join(packageDir, path));
}

function config(packageDir, options = {}) {
  return createVitestConfig({ packageDir, packageName: '@stynx-nyx/privacy', ...options });
}

const declared = ['src/**/*.ts', '!src/index.ts', '!src/tokens.ts', '!src/privacy.module.ts'];

test('installed Vitest exposes the prior negated-include OR leak; the shared factory closes it', () => {
  fixture((packageDir) => {
    const prior = matcher(packageDir, { include: declared, exclude: [] });
    assert.equal(prior('test/support/runtime.ts'), true, 'native matcher must expose the old leak');
    assert.equal(prior('dist/privacy/src/service.js'), true);
    const current = matcher(
      packageDir,
      config(packageDir, { collectCoverageFrom: declared }).test.coverage,
    );
    assert.equal(current('src/service.ts'), true);
    assert.equal(current('test/support/runtime.ts'), false);
    assert.equal(current('dist/privacy/src/service.js'), false);
    assert.equal(current('src/index.ts'), false);
    assert.equal(current('src/tokens.ts'), false);
    assert.equal(current('src/privacy.module.ts'), false);
  });
});

test('positive-only defaults retain the source scope and sibling package boundary', () => {
  fixture((packageDir) => {
    const current = matcher(packageDir, config(packageDir).test.coverage);
    assert.equal(current('src/service.ts'), true);
    assert.equal(current('test/unit/service.spec.ts'), false);
    assert.equal(current('dist/service.js'), false);
    assert.equal(current('../outside/src/service.ts'), false);
    assert.equal(current(`../${packageDir.split('/').at(-1)}-neighbor/src/service.ts`), false);
  });
});

test('declared subtraction and caller exclusions retain their actual matcher behavior', () => {
  fixture((packageDir) => {
    const current = matcher(
      packageDir,
      config(packageDir, {
        collectCoverageFrom: ['src/**/*.ts', '!src/legacy.ts'],
        coverageExclude: ['src/host-only.ts'],
      }).test.coverage,
    );
    assert.equal(current('src/service.ts'), true);
    assert.equal(current('src/legacy.ts'), false);
    assert.equal(current('src/host-only.ts'), false);
    assert.equal(current('src/generated/value.ts'), false);
    assert.equal(current('src/main.ts'), false);
    assert.equal(current('src/types.ts'), false);
    assert.equal(current('src/contract.d.ts'), false);
  });
});

for (const [name, source] of [
  ['runtime const', 'export const service = 1;\n'],
  ['runtime initializer', "export { service } from './service';\ninitialize();\n"],
  ['invalid source', 'export {\n'],
  ['empty source', ''],
  ['missing source', null],
]) {
  test(`negative index declaration refuses ${name}, while default coverage retains it`, () => {
    fixture((packageDir) => {
      assert.throws(() => config(packageDir, { collectCoverageFrom: declared }), /entry point/u);
      assert.equal(matcher(packageDir, config(packageDir).test.coverage)('src/index.ts'), true);
    }, source);
  });
}

test('a broad subtraction cannot hide an executable index behind the pure-barrel guard', () => {
  fixture((packageDir) => {
    assert.throws(
      () =>
        config(packageDir, {
          collectCoverageFrom: ['src/**/*.ts', '!src/**'],
        }),
      /entry point|pattern|negation/u,
    );
  }, 'export const service = execute();\n');
});

for (const [name, patterns] of [
  ['empty population', []],
  ['negative-only population', ['!src/tokens.ts']],
  ['empty pattern', ['src/**/*.ts', '']],
  ['bare negation', ['src/**/*.ts', '!']],
  ['non-string pattern', ['src/**/*.ts', null]],
  ['non-array population', 'src/**/*.ts'],
  ['ambiguous double negation', ['src/**/*.ts', '!!src/tokens.ts']],
  ['whitespace-only pattern', ['src/**/*.ts', '  ']],
]) {
  test(`coverage declarations refuse ${name}`, () => {
    fixture((packageDir) => {
      assert.throws(() => config(packageDir, { collectCoverageFrom: patterns }), /Coverage/u);
    });
  });
}

test('all four package thresholds and aggregate-mode semantics remain exact', () => {
  fixture((packageDir) => {
    const previous = process.env.STYNX_AGGREGATE_COVERAGE;
    try {
      delete process.env.STYNX_AGGREGATE_COVERAGE;
      assert.deepEqual(config(packageDir).test.coverage.thresholds, {
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
        autoUpdate: false,
      });
      const custom = { statements: 91, branches: 82, functions: 93, lines: 84 };
      assert.deepEqual(
        config(packageDir, { coverageThreshold: custom }).test.coverage.thresholds,
        custom,
      );
      process.env.STYNX_AGGREGATE_COVERAGE = '1';
      assert.deepEqual(config(packageDir, { coverageThreshold: custom }).test.coverage.thresholds, {
        statements: 0,
        branches: 0,
        functions: 0,
        lines: 0,
      });
      assert.equal(matcher(packageDir, config(packageDir).test.coverage)('src/service.ts'), true);
      assert.equal(
        matcher(packageDir, config(packageDir).test.coverage)('test/support/runtime.ts'),
        false,
      );
    } finally {
      if (previous === undefined) delete process.env.STYNX_AGGREGATE_COVERAGE;
      else process.env.STYNX_AGGREGATE_COVERAGE = previous;
    }
  });
});

test('ancestor directory named src cannot admit helpers or built mirrors', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx ancestor população-'));
  const packageDir = join(workspace, 'src', 'workspace with spaces', 'packages', 'privacy');
  try {
    mkdirSync(join(packageDir, 'src'), { recursive: true });
    writeFileSync(join(packageDir, 'src/index.ts'), "export { value } from './value';\n");
    const current = matcher(
      packageDir,
      config(packageDir, { collectCoverageFrom: declared }).test.coverage,
    );
    assert.equal(current('src/service.ts'), true);
    assert.equal(current('test/support/runtime.ts'), false);
    assert.equal(current('dist/privacy/src/service.js'), false);
    assert.equal(current('dist/privacy/src/service.ts'), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('literal glob metacharacters in the package root retain source coverage without broadening it', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx [fixture] {é} (group)+@!*-'));
  const packageDir = join(workspace, 'privacy');
  try {
    mkdirSync(join(packageDir, 'src'), { recursive: true });
    writeFileSync(join(packageDir, 'src/index.ts'), "export { service } from './service';\n");
    const current = matcher(
      packageDir,
      config(packageDir, { collectCoverageFrom: declared }).test.coverage,
    );
    assert.equal(current('src/service.ts'), true);
    assert.equal(current('src/index.ts'), false);
    assert.equal(current('test/support/runtime.ts'), false);
    assert.equal(current('dist/privacy/src/service.ts'), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test('ancestor src/generated does not activate package-relative default exclusions', () => {
  const workspace = mkdtempSync(join(tmpdir(), 'stynx ancestors população-'));
  const packageDir = join(workspace, 'src', 'generated', 'workspace', 'privacy');
  try {
    mkdirSync(join(packageDir, 'src'), { recursive: true });
    writeFileSync(join(packageDir, 'src/index.ts'), "export { service } from './service';\n");
    const current = matcher(packageDir, config(packageDir).test.coverage);
    assert.equal(current('src/service.ts'), true);
    assert.equal(current('src/generated/model.ts'), false);
    assert.equal(current('test/support/runtime.ts'), false);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
