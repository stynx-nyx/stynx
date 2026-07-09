import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { createLibConfig } from '../index.mjs';

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
