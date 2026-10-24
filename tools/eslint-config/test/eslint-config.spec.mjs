import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { createLibConfig } from '../index.mjs';

test('the required ordinary command executes every authored ESLint contract suite', () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8'));
  const authored = readdirSync(import.meta.dirname)
    .filter((name) => name.endsWith('.spec.mjs'))
    .map((name) => `test/${name}`)
    .sort();
  const tokens = manifest.scripts.test.split(/\s+/u);
  expectOrdinaryPopulation(tokens, authored);
  const coverage = manifest.scripts['test:coverage'].split(/\s+/u);
  assert.deepEqual(coverage.slice(0, 2), ['node', '../../scripts/node-test-coverage.mjs']);
  assert.deepEqual(coverage.slice(2).sort(), authored);
});

function expectOrdinaryPopulation(tokens, authored) {
  assert.deepEqual(tokens.slice(0, 3), ['node', '--test', '--test-concurrency=1']);
  assert.deepEqual(tokens.slice(3).sort(), authored);
  assert.ok(authored.includes('test/eslint-config.spec.mjs'));
  assert.ok(authored.includes('test/rule-families.spec.mjs'));
  assert.ok(authored.includes('test/typed-query-lint.spec.mjs'));
  assert.ok(authored.includes('test/query-declaration-census.spec.mjs'));
  assert.ok(authored.includes('test/legacy-testing-assertions.spec.mjs'));
}

const tsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src/**/*.ts'],
};

async function lintSnippet({ packageName, code }) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx-eslint-config-')));
  const previousCwd = process.cwd();
  const previousPackageName = process.env.npm_package_name;

  try {
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
    writeFileSync(join(root, 'src', 'subject.ts'), code);

    process.chdir(root);
    process.env.npm_package_name = packageName;

    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: createLibConfig({ files: ['src/**/*.ts'] }),
    });

    const [result] = await eslint.lintFiles(['src/subject.ts']);
    return result.messages;
  } finally {
    process.chdir(previousCwd);
    if (previousPackageName === undefined) {
      delete process.env.npm_package_name;
    } else {
      process.env.npm_package_name = previousPackageName;
    }
    rmSync(root, { recursive: true, force: true });
  }
}

test('rejects raw PostgreSQL imports outside data and cli packages', async () => {
  const messages = await lintSnippet({
    packageName: '@stynx-nyx/auth',
    code: "import { Client } from 'pg';\nexport const client = Client;\n",
  });

  assert.ok(
    messages.some((message) => message.ruleId === 'no-restricted-imports'),
    'expected no-restricted-imports to reject raw pg import',
  );
});

test('allows raw PostgreSQL imports in data and cli packages', async () => {
  for (const packageName of ['@stynx-nyx/data', '@stynx-nyx/cli']) {
    const messages = await lintSnippet({
      packageName,
      code: "import { Client } from 'pg';\nexport const client = Client;\n",
    });

    assert.deepEqual(
      messages.filter((message) => message.ruleId === 'no-restricted-imports'),
      [],
      `expected ${packageName} to allow raw pg import`,
    );
  }
});

test('allows published catalog exports while rejecting workspace source deep imports', async () => {
  for (const locale of ['en', 'pt-BR']) {
    const messages = await lintSnippet({
      packageName: '@stynx-nyx/reference-web',
      code: `import catalog from '@stynx-nyx/angular-ui/catalogs/${locale}.json';\nexport const labels = catalog;\n`,
    });
    assert.deepEqual(
      messages.filter((message) => message.ruleId === 'no-restricted-imports'),
      [],
      `expected the public ${locale} catalog export to be allowed`,
    );
  }

  const messages = await lintSnippet({
    packageName: '@stynx-nyx/reference-web',
    code: "import { hidden } from '@stynx-nyx/angular-ui/src/internal';\nexport const value = hidden;\n",
  });
  assert.ok(
    messages.some((message) => message.ruleId === 'no-restricted-imports'),
    'expected workspace source deep imports to remain forbidden',
  );
});

test('activates boundaries plugin and internal dependency rule', () => {
  const previousPackageName = process.env.npm_package_name;
  process.env.npm_package_name = '@stynx-nyx/core';

  try {
    const config = createLibConfig();
    const typedConfig = config.find((item) => item.plugins?.boundaries);
    assert.ok(typedConfig, 'expected boundaries plugin in shared lib config');

    const rule = typedConfig.rules?.['boundaries/dependencies'];
    assert.ok(Array.isArray(rule), 'expected boundaries/dependencies rule');
    assert.equal(rule[0], 'error');
    assert.ok(
      rule[1]?.rules?.some(
        (entry) =>
          entry.disallow?.to?.type === '*' && entry.disallow?.to?.internalPath === 'internal/**',
      ),
      'expected internal workspace module dependency rule',
    );
  } finally {
    if (previousPackageName === undefined) {
      delete process.env.npm_package_name;
    } else {
      process.env.npm_package_name = previousPackageName;
    }
  }
});


test('root hook TypeScript redeclarations preserve overloads and reject duplicate values', async () => {
  const workspaceRoot = join(import.meta.dirname, '../../..');
  // Resolve the actual root config exactly as the ordinary hook does. Do not
  // reconstruct rules or supply an override that could hide a broken root gate.
  const eslint = new ESLint({ cwd: workspaceRoot });
  const overload = 'export function convert(value: string): string; export function convert(value: number): number; export function convert(value: string | number): string | number { return value; }';
  const single = 'export function convert(value: string): string { return value; }';
  const duplicate = 'var repeated = 1; var repeated = 2; export { repeated };';
  for (const extension of ['ts', 'mts', 'cts']) {
    const filePath = join(workspaceRoot, `packages/core/src/__root-hook-contract.${extension}`);
    const config = await eslint.calculateConfigForFile(filePath);
    assert.ok(config, `actual ${extension} root config must resolve`);
    assert.ok(config.languageOptions.parser, 'actual TypeScript parser must remain installed');
    assert.ok(config.plugins['@typescript-eslint'], 'actual TypeScript plugin must remain installed');
    assert.equal(config.languageOptions.parserOptions.project, undefined);
    assert.equal(config.languageOptions.parserOptions.projectService, undefined);
    const [validOverload] = await eslint.lintText(overload, { filePath });
    assert.deepEqual(validOverload.messages, [], `${extension}: one implementation plus overload signatures`);
    const [validSingle] = await eslint.lintText(single, { filePath });
    assert.deepEqual(validSingle.messages, [], `${extension}: ordinary single implementation`);
    assert.equal(config.rules['no-redeclare'][0], 0);
    assert.equal(config.rules['@typescript-eslint/no-redeclare'][0], 2);
    const [invalid] = await eslint.lintText(duplicate, { filePath });
    assert.deepEqual(invalid.messages.filter((message) => message.fatal), []);
    assert.equal(invalid.messages.filter((message) =>
      message.ruleId === '@typescript-eslint/no-redeclare' && message.severity === 2).length, 1,
    `${extension}: actual duplicate values remain errors`);
    assert.equal(invalid.messages.filter((message) => message.ruleId === 'no-redeclare').length, 0);
  }
});
