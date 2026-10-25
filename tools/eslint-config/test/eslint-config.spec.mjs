import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { createLibConfig, createScriptsConfig, createTestConfig } from '../index.mjs';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { stynxWorkspaceOptions } from '../workspace.mjs';

test('actual workspace source profiles enable every installed unsafe rule', async () => {
  const workspaceRoot = resolve(import.meta.dirname, '../../..');
  const previousCwd = process.cwd();
  const previousName = process.env.npm_package_name;
  try {
    for (const [directory, profile] of [['packages/cli', 'lib'], ['packages/data', 'nest'], ['packages-web/sdk', 'angular']]) {
      const cwd = join(workspaceRoot, directory);
      process.chdir(cwd);
      process.env.npm_package_name = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).name;
      const eslint = new ESLint({ cwd, overrideConfigFile: join(workspaceRoot, 'tools/eslint-config', `${profile}.mjs`) });
      const config = await eslint.calculateConfigForFile(join(cwd, 'src/index.ts'));
      assert.ok(config, `${profile}: actual source must resolve`);
      for (const name of ['no-explicit-any', ...Object.keys(tsPlugin.rules).filter(name => name.startsWith('no-unsafe-'))]) {
        assert.equal(config.rules[`@typescript-eslint/${name}`]?.[0], 2, `${profile}: ${name}`);
      }
    }
  } finally {
    process.chdir(previousCwd);
    if (previousName === undefined) delete process.env.npm_package_name;
    else process.env.npm_package_name = previousName;
  }
});

test('workspace query enforcement reaches every declared source element', () => {
  const roots = stynxWorkspaceOptions.boundaries.elements.map(element => element.pattern.replace(/\/src\/\*\*$/u, '')).sort();
  assert.ok(roots.includes('domain/demo-bookmark/api'));
  assert.ok(roots.includes('domain/demo-bookmark/web'));
  assert.ok(roots.includes('reference/api'));
  assert.ok(roots.includes('reference/web'));
  assert.deepEqual([...stynxWorkspaceOptions.workspaceQuery.packageRoots].sort(), roots);
});

test('normal root lint selects reference and both domain application jobs', () => {
  const manifest = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8'));
  const filters = [...manifest.scripts.lint.matchAll(/--filter='([^']+)'/gu)].map(match => match[1]);
  for (const root of ['./packages/*', './packages-web/*', './tools/*', './test/*', './reference/*', './domain/*/api', './domain/*/web']) assert.ok(filters.includes(root), `${root} must be selected by the ordinary command`);
  assert.match(manifest.scripts.lint, /^turbo run lint /u);
  assert.match(manifest.scripts.lint, / -- --max-warnings=0$/u);
});

test('the normal domain API lint command resolves its actual source configuration', () => {
  const directory = resolve(import.meta.dirname, '../../../domain/demo-bookmark/api');
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const config = /--config\s+(\S+)/u.exec(manifest.scripts.lint)?.[1];
  assert.ok(config);
  assert.equal(resolve(directory, config), resolve(import.meta.dirname, '../nest.mjs'));
  assert.ok(existsSync(resolve(directory, config)));
});

test('the actual domain web configuration gives all seven implementation files a Program', async () => {
  const cwd = resolve(import.meta.dirname, '../../../domain/demo-bookmark/web');
  const configPath = join(cwd, 'eslint.config.mjs');
  assert.ok(existsSync(configPath), 'the ordinary domain web job must have its own typed configuration');
  const previousCwd = process.cwd();
  const visited = [];
  try {
    process.chdir(cwd);
    const eslint = new ESLint({ cwd, overrideConfigFile: configPath, overrideConfig: [{
      files: ['src/**/*.ts'],
      plugins: { inspectorProgram: { rules: { actual: {
        meta: { schema: [] },
        create(context) { return { Program() {
          const program = context.sourceCode.parserServices.program;
          assert.ok(program, context.filename);
          assert.ok(program.getSourceFile(context.filename), 'actual implementation belongs to the Program');
          visited.push(context.filename);
        } }; },
      } } } },
      rules: { 'inspectorProgram/actual': 'error' },
    }] });
    const results = await eslint.lintFiles(['src/**/*.ts']);
    assert.equal(results.length, 7);
    assert.equal(visited.length, 7);
    assert.equal(new Set(visited).size, 7);
    assert.deepEqual(results.flatMap(result => result.messages.filter(message => message.fatal)), []);
    assert.equal(results.filter(result => result.messages.some(message => message.message.includes('ignored'))).length, 0);
  } finally { process.chdir(previousCwd); }
});

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
    const filePath = join(workspaceRoot, `packages/core/test/__root-hook-contract.${extension}`);
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

// Actual owning profiles are checked in isolated processes because profile
// factories capture cwd and package identity when their module is loaded.
const parityRoots = [
 ["packages/cli","src/audit.ts","lib"],
 ["packages/data","src/storage-catalog.repository.ts","nest"],
 ["packages/storage","src/s3.service.ts","nest"],
 ["packages-web/sdk","src/index.ts","lib"],
 ["reference/api","src/query-schemas.ts","nest"],
 ["reference/web","src/app/app.component.ts","angular"],
 ["domain/demo-bookmark/api","src/demo-bookmark/services/bookmark.service.ts","nest"],
 ["domain/demo-bookmark/web","src/app/demo-bookmark/bookmark-list.component.ts","local"],
 ["tools/database-tooling","src/demo-bookmark.repository.ts","local"],
 ["tools/migration-linter","src/lint.ts","lib"]
];
function probeWorkspaceProfile(directory, file, profile, mode, configOnly = false, witness = '') {
  const root = resolve(import.meta.dirname, '../../..');
  const result = spawnSync(process.execPath, [join(import.meta.dirname, 'support/workspace-profile-probe.mjs'), root, directory, file, mode, profile], {
    cwd: root, encoding: 'utf8', timeout: 90000,
    env: { ...process.env, STYNX_INSPECTOR_CONFIG_ONLY: configOnly ? '1' : '0', STYNX_INSPECTOR_WITNESS: witness },
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const observation = JSON.parse(result.stdout);
  assert.equal(observation.error, undefined);
  return observation;
}
for (const [directory, file, profile] of parityRoots) {
  test(`root typed source profile matches the owning package: ${directory}`, () => {
    const root = probeWorkspaceProfile(directory, file, profile, 'root');
    assert.equal(root.typedProject, true, 'root source must configure its real TypeScript project');
    assert.deepEqual(root.visited.map(({ hasProgram, belongs }) => ({ hasProgram, belongs })), [{ hasProgram: true, belongs: true }]);
    assert.deepEqual(root.results.flatMap(result => result.fatal), []);
    const own = probeWorkspaceProfile(directory, file, profile, 'package');
    assert.deepEqual(own.visited.map(({ hasProgram, belongs }) => ({ hasProgram, belongs })), [{ hasProgram: true, belongs: true }]);
    assert.deepEqual(own.results.flatMap(result => result.fatal), []);
    assert.deepEqual(root.rules, own.rules, 'unsafe, query, import, documentation and Angular policies must match');
    assert.deepEqual(root.processor, own.processor, 'actual inline template extraction must match the owning profile');
    assert.deepEqual(root.ignored, own.ignored, 'installed basePath must scope generated and output ignores correctly');
  });
}
for (const [directory, file, profile] of parityRoots.filter(([directory]) => ['packages/cli', 'packages/data', 'packages/storage', 'packages-web/sdk'].includes(directory))) {
  test(`workspace policy uses the owning manifest despite npm identity: ${directory}`, () => {
    const own = probeWorkspaceProfile(directory, file, profile, 'package', true);
    const poisoned = probeWorkspaceProfile(directory, file, profile, 'poisoned-package', true);
    assert.deepEqual(poisoned.rules, own.rules);
  });
}

test('root source keeps a native unsafe witness active in its owning sibling root', () => {
  const observation = probeWorkspaceProfile('packages/data', 'src/storage-catalog.repository.ts', 'nest', 'root', false, 'unsafe');
  assert.deepEqual(observation.witness.map(message => [message.ruleId, message.severity]), [['@typescript-eslint/no-explicit-any', 2]]);
});
test('root and package process the same native inline Angular template violation', () => {
  const args = ['reference/web', 'src/app/app.component.ts', 'angular'];
  const root = probeWorkspaceProfile(...args, 'root', true, 'template');
  const own = probeWorkspaceProfile(...args, 'package', true, 'template');
  assert.ok(root.witness.some(message => message.ruleId === '@angular-eslint/template/eqeqeq' && message.severity === 2));
  assert.deepEqual(root.witness, own.witness);
});
test('root F2 keeps only its exact two admitted expressions while rejecting a new cast', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const filename = join(root, 'packages/testing/src/fake-transaction.ts');
  const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.config.mjs') });
  const config = await eslint.calculateConfigForFile(filename);
  assert.equal(config.rules['@typescript-eslint/no-unsafe-type-assertion']?.[0], 2);
  const original = readFileSync(filename, 'utf8');
  const [clean] = await eslint.lintText(original, { filePath: filename });
  assert.deepEqual(clean.messages.filter(message => message.ruleId === '@typescript-eslint/no-unsafe-type-assertion'), []);
  const modified = original.replace('  const pending = [...script];', '  const forbidden = {} as Transaction;\n  const pending = [...script];');
  assert.notEqual(modified, original);
  const [negative] = await eslint.lintText(modified, { filePath: filename });
  const actual = negative.messages.filter(message => message.ruleId === '@typescript-eslint/no-unsafe-type-assertion');
  assert.equal(actual.length, 1);
  assert.equal(actual[0].messageId, 'unsafeTypeAssertion');
  assert.equal(actual[0].severity, 2);
});
test('published factories and ordinary test fallback retain their separate syntax contracts', async () => {
  const root = resolve(import.meta.dirname, '../../..');
  const filename = join(root, 'packages/preferences/test/preferences-patch-preservation.spec.ts');
  const eslint = new ESLint({ cwd: root, overrideConfigFile: join(root, 'eslint.config.mjs') });
  const config = await eslint.calculateConfigForFile(filename);
  assert.equal(config.languageOptions.parserOptions.project, undefined);
  assert.equal(config.rules['@typescript-eslint/no-explicit-any'][0], 0);
  assert.equal(createTestConfig().find(config => config.languageOptions?.parser)?.languageOptions.parserOptions.project, undefined);
  assert.ok(createScriptsConfig().some(config => config.rules?.['stynx/no-authored-cjs'] === 'error'));
  const consumer = realpathSync(mkdtempSync(join(tmpdir(), 'stynx-public-profile-')));
  try {
    assert.doesNotThrow(() => createLibConfig({ rootDir: consumer }));
    assert.equal(createLibConfig({ rootDir: consumer }).find(config => config.plugins?.['@typescript-eslint']).plugins['@typescript-eslint'], tsPlugin);
  } finally { rmSync(consumer, { recursive: true, force: true }); }
});
test('workspace profile fails closed on a missing owning manifest', () => {
  const consumer = realpathSync(mkdtempSync(join(tmpdir(), 'stynx-private-profile-')));
  try {
    assert.throws(() => createLibConfig({ rootDir: consumer, workspaceQuery: stynxWorkspaceOptions.workspaceQuery }), /package\.json/);
  } finally { rmSync(consumer, { recursive: true, force: true }); }
});

for (const [name, lint, expected] of [
  ['missing normal profile', null, /Workspace source root has no normal lint command: packages\/cli/u],
  ['unclassified normal profile', 'eslint --config unsupported.mjs src', /Unclassified workspace source lint profile: packages\/cli/u],
]) {
  test(`root source composition refuses ${name}`, () => {
    const root = resolve(import.meta.dirname, '../../..');
    const subject = join(root, 'tools/eslint-config/root-workspace-source.mjs');
    assert.ok(existsSync(subject), 'the complete root source configuration must be present');
    const code = `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      import { pathToFileURL } from 'node:url';
      const target = ${JSON.stringify(join(root, 'packages/cli/package.json'))};
      const original = fs.readFileSync;
      fs.readFileSync = function(filename, ...args) {
        const result = original.call(this, filename, ...args);
        if (String(filename) !== target) return result;
        const manifest = JSON.parse(String(result));
        if (${JSON.stringify(lint)} === null) delete manifest.scripts.lint;
        else manifest.scripts.lint = ${JSON.stringify(lint)};
        return JSON.stringify(manifest);
      };
      syncBuiltinESMExports();
      try { await import(pathToFileURL(${JSON.stringify(subject)}).href); console.log(JSON.stringify({ accepted: true })); }
      catch (error) { console.log(JSON.stringify({ accepted: false, message: error.message })); }
    `;
    const result = spawnSync(process.execPath, ['--input-type=module', '--eval', code], { cwd: root, encoding: 'utf8', timeout: 30000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const observation = JSON.parse(result.stdout);
    assert.equal(observation.accepted, false);
    assert.match(observation.message, expected);
  });
}

test('root typed source redeclarations preserve overloads and reject duplicate values', async () => {
  const workspaceRoot = resolve(import.meta.dirname, '../../..');
  const filePath = join(workspaceRoot, 'packages/core/src/tokens.ts');
  assert.ok(existsSync(filePath), 'typed witness uses a real Program member');
  const observed = [];
  const eslint = new ESLint({ cwd: workspaceRoot, overrideConfig: [{
    files: ['**/*.ts'],
    plugins: { inspectorTypedOverload: { rules: { membership: {
      meta: { schema: [] },
      create(context) { return { Program() {
        const program = context.sourceCode.parserServices.program;
        observed.push(!!program?.getSourceFile(context.filename));
      } }; },
    } } } },
    rules: { 'inspectorTypedOverload/membership': 'error' },
  }] });
  const config = await eslint.calculateConfigForFile(filePath);
  assert.ok(config.languageOptions.parserOptions.project);
  assert.equal(config.rules['no-redeclare'][0], 0);
  assert.equal(config.rules['@typescript-eslint/no-redeclare'][0], 2);
  const overload = 'export function convert(value: string): string; export function convert(value: number): number; export function convert(value: string | number): string | number { return value; }';
  const single = 'export function convert(value: string): string { return value; }';
  for (const source of [overload, single]) {
    const [result] = await eslint.lintText(source, { filePath });
    assert.deepEqual(result.messages, []);
  }
  const [invalid] = await eslint.lintText('var repeated = 1; var repeated = 2; export { repeated };', { filePath });
  assert.deepEqual(invalid.messages.filter(message => message.fatal), []);
  assert.equal(invalid.messages.filter(message => message.ruleId === '@typescript-eslint/no-redeclare' && message.severity === 2).length, 1);
  assert.equal(invalid.messages.filter(message => message.ruleId === 'no-redeclare').length, 0);
  assert.deepEqual(observed, [true, true, true]);
});


const toolingProgramObservations = new Map();
function observeToolingProgram(mode) {
  if (!toolingProgramObservations.has(mode)) {
    const root = resolve(import.meta.dirname, '../../..');
    const child = spawnSync(process.execPath, [resolve(import.meta.dirname, 'support/tooling-program-probe.mjs'), root, mode], { cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    assert.equal(child.status, 0, child.stdout + child.stderr);
    toolingProgramObservations.set(mode, JSON.parse(child.stdout));
  }
  return toolingProgramObservations.get(mode);
}

test('D3 actual ESLint implementation and generator bodies belong to real checkJs Programs', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const actual = observeToolingProgram('root');
  assert.equal(actual.visited.length, actual.files.length);
  assert.ok(actual.files.includes('tools/eslint-config/index.mjs'));
  assert.ok(actual.files.includes('packages-web/sdk/scripts/codegen.mjs'));
  for (const file of actual.files) {
    const seen = actual.visited.find(item => item.file === resolve(root, file));
    assert.ok(seen?.hasProgram, file);
    assert.equal(seen.belongs, true, file);
    assert.equal(seen.allowJs, true, file);
    assert.equal(seen.checkJs, true, file);
  }
  assert.deepEqual(actual.results.flatMap(item => item.fatal), []);
});

test('D3 actual tooling profiles enable every unsafe rule and reject native JS unsafe access', () => {
  const actual = observeToolingProgram('root');
  const names = ['@typescript-eslint/no-explicit-any', ...Object.keys(tsPlugin.rules).filter(name => name.startsWith('no-unsafe-')).map(name => `@typescript-eslint/${name}`)];
  for (const file of actual.files) for (const name of names) assert.equal(actual.rules[file][name], 2, `${file}: ${name}`);
  assert.ok(actual.witness.some(item => item.ruleId === '@typescript-eslint/no-unsafe-assignment'));
  assert.ok(actual.witness.some(item => item.ruleId === '@typescript-eslint/no-unsafe-call'));
  assert.ok(actual.witness.some(item => item.ruleId === '@typescript-eslint/no-unsafe-member-access'));
});

test('D3 explicit generator Program roots equal the complete actual executable directory population', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const directory = resolve(root, 'tools/eslint-config');
  const configuration = JSON.parse(readFileSync(resolve(directory, 'tsconfig.workspace-generators.json'), 'utf8'));
  const expected = ['packages-web/sdk/codegen', 'packages-web/sdk/scripts', 'packages/cli/engines'].flatMap(path => readdirSync(resolve(root, path)).filter(name => name.endsWith('.mjs')).map(name => resolve(root, path, name))).sort();
  assert.deepEqual(configuration.files.map(file => resolve(directory, file)).sort(), expected);
  assert.deepEqual(configuration.include, []);
  assert.equal(configuration.compilerOptions.allowJs, true);
  assert.equal(configuration.compilerOptions.checkJs, true);
  const implementation = JSON.parse(readFileSync(resolve(directory, 'tsconfig.workspace-eslint.json'), 'utf8'));
  assert.deepEqual(implementation.include, ['./*.mjs']);
  assert.equal(implementation.compilerOptions.allowJs, true);
  assert.equal(implementation.compilerOptions.checkJs, true);
});

test('D3 normal tooling lint command uses the same real Program and unsafe policy as root', () => {
  const root = resolve(import.meta.dirname, '../../..');
  const manifest = JSON.parse(readFileSync(resolve(root, 'tools/eslint-config/package.json'), 'utf8'));
  assert.equal(typeof manifest.scripts.lint, 'string');
  assert.match(manifest.scripts.lint, /^cd \.\.\/\.\. && eslint --config tools\/eslint-config\/workspace-tooling\.mjs --max-warnings=0 /u);
  for (const glob of ['tools/eslint-config/*.mjs', 'packages-web/sdk/codegen/*.mjs', 'packages-web/sdk/scripts/*.mjs', 'packages/cli/engines/*.mjs']) assert.ok(manifest.scripts.lint.includes(`"${glob}"`));
  const direct = observeToolingProgram('root');
  const normal = observeToolingProgram('normal');
  assert.deepEqual(normal.files, direct.files);
  assert.deepEqual(normal.rules, direct.rules);
  assert.ok(normal.visited.every(item => item.hasProgram && item.belongs && item.allowJs && item.checkJs));
  assert.equal(normal.visited.length, normal.files.length);
  assert.deepEqual(normal.results.flatMap(item => item.fatal), []);
  assert.ok(normal.witness.some(item => item.ruleId === '@typescript-eslint/no-unsafe-assignment'));
});
