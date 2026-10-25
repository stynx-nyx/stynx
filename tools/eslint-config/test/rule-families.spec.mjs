// SM-03 acceptance: every enabled rule family has one fixture that makes
// `eslint --max-warnings=0` exit 1 naming that rule, and each profile has a
// clean fixture that exits 0. Each run lints from a throwaway consumer root
// that installs this package as `node_modules/@stynx-nyx/eslint-config`, so
// the profiles are exercised exactly as an adopter resolves them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join, matchesGlob } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import angularConfig from '../angular.mjs';
import libConfig from '../lib.mjs';
import nestConfig from '../nest.mjs';
import { stynxWorkspaceOptions } from '../workspace.mjs';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(dirname(packageDir));
const fixturesDir = join(packageDir, 'test', 'fixtures');
const packageManifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
const eslintBin = join(
  dirname(fileURLToPath(import.meta.resolve('eslint/package.json'))),
  'bin',
  'eslint.js',
);

const consumerTsconfig = {
  compilerOptions: {
    target: 'ES2022',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    experimentalDecorators: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  },
  include: ['src/**/*.ts'],
};

const profiles = {
  lib: {
    subject: 'src/feature/subject.ts',
    config: `import { createLibConfig } from '@stynx-nyx/eslint-config';

export default createLibConfig({
  boundaries: {
    elements: [
      { type: 'core', pattern: 'src/core/**' },
      { type: 'feature', pattern: 'src/feature/**' },
      { type: 'blocked', pattern: 'src/blocked/**' },
    ],
    allow: [{ from: { type: 'feature' }, allow: { to: { type: 'core' } } }],
  },
});
`,
  },
  nest: {
    subject: 'src/feature/subject.ts',
    config: `import { createNestConfig } from '@stynx-nyx/eslint-config';

export default createNestConfig();
`,
  },
  angular: {
    subject: 'src/feature/subject.ts',
    config: `import { createAngularConfig } from '@stynx-nyx/eslint-config';

export default createAngularConfig();
`,
  },
  scripts: {
    subject: 'scripts/subject.mjs',
    config: `import { createScriptsConfig } from '@stynx-nyx/eslint-config';

export default createScriptsConfig();
`,
  },
  test: {
    subject: 'test/subject.spec.ts',
    config: `export { default } from '@stynx-nyx/eslint-config/test';
`,
  },
};

const supportFiles = {
  'src/core/value.ts': 'export const coreValue: number = 1;\n',
  'src/feature/helper.ts': 'export const helperValue: number = 2;\n',
  'src/blocked/secret.ts': 'export const blockedValue: number = 3;\n',
};

function runEslint(cwd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [eslintBin, ...args], {
      cwd,
      env: { ...process.env, npm_package_name: '' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8').on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

async function lintFixture(profileName, fixture) {
  const profile = profiles[profileName];
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'stynx-eslint-consumer-')));
  try {
    mkdirSync(join(root, 'node_modules', '@stynx-nyx'), { recursive: true });
    symlinkSync(packageDir, join(root, 'node_modules', '@stynx-nyx', 'eslint-config'), 'dir');
    writeFileSync(join(root, 'tsconfig.json'), `${JSON.stringify(consumerTsconfig, null, 2)}\n`);
    writeFileSync(join(root, 'eslint.config.mjs'), profile.config);
    for (const [path, contents] of Object.entries(supportFiles)) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), contents);
    }
    mkdirSync(dirname(join(root, profile.subject)), { recursive: true });
    copyFileSync(join(fixturesDir, fixture), join(root, profile.subject));

    const run = await runEslint(root, ['--max-warnings=0', '--format', 'json', profile.subject]);
    const results = run.stdout.length > 0 ? JSON.parse(run.stdout) : [];
    return {
      status: run.status,
      stderr: run.stderr,
      messages: results.flatMap((result) => result.messages),
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const unsafeRuleNames = Object.keys(tsPlugin.rules)
  .filter((name) => name.startsWith('no-unsafe-'))
  .sort();

const failingFixtures = [
  ['lib', 'no-explicit-any.ts.fixture', '@typescript-eslint/no-explicit-any'],
  ...unsafeRuleNames.map((name) => ['lib', `${name}.ts.fixture`, `@typescript-eslint/${name}`]),
  ['lib', 'boundaries.ts.fixture', 'boundaries/dependencies'],
  ['nest', 'idempotency.ts.fixture', 'stynx/require-idempotent-route-decorator'],
  ['lib', 'cjs-require.ts.fixture', 'stynx/no-authored-cjs'],
  ['lib', 'cjs-create-require.ts.fixture', 'stynx/no-authored-cjs'],
  ['lib', 'cjs-module-exports.ts.fixture', 'stynx/no-authored-cjs'],
  ['lib', 'cjs-dirname.ts.fixture', 'stynx/no-authored-cjs'],
  ['lib', 'cjs-filename.ts.fixture', 'stynx/no-authored-cjs'],
  ['lib', 'cjs-import-equals.ts.fixture', 'stynx/no-authored-cjs'],
  ['scripts', 'cjs-script.mjs.fixture', 'stynx/no-authored-cjs'],
  ['test', 'cw1-existence-assertion.spec.ts.fixture', 'no-restricted-syntax'],
];

const cleanFixtures = [
  ['lib', 'clean-lib.ts.fixture'],
  ['nest', 'clean-nest.ts.fixture'],
  ['angular', 'clean-angular.ts.fixture'],
  ['scripts', 'clean-script.mjs.fixture'],
  ['test', 'clean.spec.ts.fixture'],
];

test('package exports the named-factory root and the ./test profile only', async () => {
  assert.equal(packageManifest.name, '@stynx-nyx/eslint-config');
  assert.equal(packageManifest.type, 'module');
  assert.deepEqual(packageManifest.exports, { '.': './index.mjs', './test': './test.mjs' });

  const root = await import('../index.mjs');
  assert.deepEqual(Object.keys(root).sort(), [
    'createAngularConfig',
    'createLibConfig',
    'createNestConfig',
    'createScriptsConfig',
    'createTestConfig',
  ]);
  const testProfile = await import('../test.mjs');
  assert.deepEqual(Object.keys(testProfile), ['default']);
  assert.deepEqual(testProfile.default, root.createTestConfig());
});

test('the installed plugin ships the no-unsafe-* rules this suite has fixtures for', () => {
  assert.deepEqual(unsafeRuleNames, [
    'no-unsafe-argument',
    'no-unsafe-assignment',
    'no-unsafe-call',
    'no-unsafe-declaration-merging',
    'no-unsafe-enum-comparison',
    'no-unsafe-function-type',
    'no-unsafe-member-access',
    'no-unsafe-return',
    'no-unsafe-type-assertion',
    'no-unsafe-unary-minus',
  ]);
});

describe('rule-family fixtures', { concurrency: availableParallelism() }, () => {
  for (const [profile, fixture, ruleId] of failingFixtures) {
    test(`${profile} profile: ${fixture} exits 1 naming ${ruleId}`, async () => {
      const { status, stderr, messages } = await lintFixture(profile, fixture);
      assert.equal(status, 1, stderr);
      assert.deepEqual(
        messages.filter((message) => message.fatal === true),
        [],
        'expected a rule finding, not a parse or config failure',
      );
      assert.ok(
        messages.some((message) => message.ruleId === ruleId && message.severity === 2),
        `expected ${ruleId} at error; got ${JSON.stringify(messages.map((message) => message.ruleId))}`,
      );
    });
  }

  for (const [profile, fixture] of cleanFixtures) {
    test(`${profile} profile: ${fixture} exits 0`, async () => {
      const { status, stderr, messages } = await lintFixture(profile, fixture);
      assert.deepEqual(messages, []);
      assert.equal(status, 0, stderr);
    });
  }
});

const rulesOf = (config) => Object.assign({}, ...config.map((item) => item.rules ?? {}));

test('STYNX workspace entry points enforce every installed unsafe rule at error', async () => {
  const previousCwd = process.cwd();
  try {
  for (const [profile, directory] of [['lib', 'packages/cli'], ['nest', 'packages/data'], ['angular', 'packages-web/sdk']]) {
    process.chdir(join(workspaceRoot, directory));
    // A workspace source gate is resolved in the package executing the command,
    // not the test harness package, which intentionally has no source element.
    const { default: config } = await import(new URL(`../${profile}.mjs?source-gate-contract`, import.meta.url).href);
    const rules = rulesOf(config);
    assert.equal(rules['@typescript-eslint/no-explicit-any'], 'error');
    for (const rule of unsafeRuleNames)
      assert.equal(rules[`@typescript-eslint/${rule}`], 'error', rule);
    assert.equal(rules['stynx/no-authored-cjs'], 'error');
    assert.equal(rules['stynx/no-raw-query'][0], 'error');
    assert.deepEqual(rules['stynx/no-raw-query'][1], { rootDir: workspaceRoot });
    assert.equal(rules['stynx/define-query-location'][0], 'error');
    assert.deepEqual(rules['stynx/define-query-location'][1], { rootDir: workspaceRoot });
  }
  } finally { process.chdir(previousCwd); }
  assert.equal(rulesOf(nestConfig)['stynx/require-idempotent-route-decorator'], 'error');
});

test('workspace query enforcement preserves published profile defaults and strict option', async () => {
  const { createLibConfig, createNestConfig, createAngularConfig } = await import('../index.mjs');
  for (const factory of [createLibConfig, createNestConfig, createAngularConfig]) {
    assert.equal(rulesOf(factory())['stynx/no-raw-query'], undefined);
    assert.equal(rulesOf(factory())['stynx/define-query-location'], undefined);
    assert.equal(rulesOf(factory({ strict: false }))['@typescript-eslint/no-explicit-any'], 'off');
    assert.equal(rulesOf(factory({ strict: true }))['@typescript-eslint/no-explicit-any'], 'error');
  }
});

// SM-12: STYNX lints itself with boundaries deny-by-default ahead of SM-11.
test('STYNX workspace entry points deny undeclared boundary dependencies', () => {
  for (const config of [libConfig, nestConfig, angularConfig]) {
    const [level, options] = rulesOf(config)['boundaries/dependencies'];
    assert.equal(level, 'error');
    assert.equal(options.default, 'disallow');
  }
});

// Every package linted through a workspace entry point is exactly one element;
// an unclassified package would sit outside the boundaries rule entirely.
const workspaceLintedPackages = () =>
  ['packages', 'packages-web', 'tools', 'reference']
    .flatMap((group) =>
      readdirSync(join(workspaceRoot, group), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${group}/${entry.name}`),
    )
    .concat(
      readdirSync(join(workspaceRoot, 'domain'), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .flatMap((entry) => [`domain/${entry.name}/api`, `domain/${entry.name}/web`]),
    )
    .filter((dir) => {
      try {
        const manifest = JSON.parse(readFileSync(join(workspaceRoot, dir, 'package.json'), 'utf8'));
        return (
          dir.startsWith('domain/') ||
          /tools\/eslint-config\/(?:lib|nest|angular)\.mjs/u.test(manifest.scripts?.lint ?? '') ||
          (existsSync(join(workspaceRoot, dir, 'eslint.config.mjs')) &&
            /create(?:Lib|Nest|Angular)Config/u.test(readFileSync(join(workspaceRoot, dir, 'eslint.config.mjs'), 'utf8')))
        );
      } catch {
        return false;
      }
    })
    .sort();

test('STYNX workspace boundaries classify every workspace-linted package once', () => {
  const { elements } = stynxWorkspaceOptions.boundaries;
  const packages = workspaceLintedPackages();
  assert.ok(packages.length >= 45, `expected the whole workspace; found ${packages.length}`);
  for (const dir of packages) {
    const matches = elements.filter((element) =>
      matchesGlob(`${dir}/src/probe.ts`, element.pattern),
    );
    assert.equal(
      matches.length,
      1,
      `${dir}: matched ${JSON.stringify(matches.map((element) => element.type))}`,
    );
  }
  assert.deepEqual(
    elements.filter(
      (element) => !packages.some((dir) => matchesGlob(`${dir}/src/probe.ts`, element.pattern)),
    ),
    [],
    'expected no element for a directory that does not exist',
  );
});

// Lints `code` as `<dir>/src/s12-probe.ts` through a STYNX workspace entry
// point with only `boundaries/dependencies` enabled, so the probe needs no
// type information and nothing is written into the workspace.
async function lintWorkspaceProbe(config, dir, code) {
  const boundariesOnly = Object.fromEntries(
    Object.keys(rulesOf(config))
      .filter((ruleId) => ruleId !== 'boundaries/dependencies')
      .map((ruleId) => [ruleId, 'off']),
  );
  const eslint = new ESLint({
    cwd: join(workspaceRoot, dir),
    overrideConfigFile: true,
    overrideConfig: [
      ...config,
      {
        files: ['**/*.ts'],
        languageOptions: { parserOptions: { project: false, projectService: false } },
        rules: boundariesOnly,
      },
    ],
  });
  const [result] = await eslint.lintText(code, {
    filePath: join(workspaceRoot, dir, 'src', 's12-probe.ts'),
  });
  return result.messages;
}

const undeclaredEdge = readFileSync(
  join(fixturesDir, 'workspace-undeclared-edge.ts.fixture'),
  'utf8',
);

test('STYNX workspace: an undeclared package-name edge exits at error', async () => {
  const messages = await lintWorkspaceProbe(nestConfig, 'packages/core', undeclaredEdge);
  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.severity]),
    [['boundaries/dependencies', 2]],
  );
});

test('STYNX workspace: declared package-name edges stay clean', async () => {
  assert.deepEqual(
    await lintWorkspaceProbe(nestConfig, 'packages/data', "export * from '@stynx-nyx/core';\n"),
    [],
  );
  assert.deepEqual(
    await lintWorkspaceProbe(
      nestConfig,
      'packages/auth',
      "export * from '@stynx-nyx/idempotency';\n",
    ),
    [],
  );
});

test('STYNX workspace: the reverse of a declared edge is denied', async () => {
  const messages = await lintWorkspaceProbe(
    nestConfig,
    'packages/data',
    "export * from '@stynx-nyx/auth';\n",
  );
  assert.deepEqual(
    messages.map((message) => message.ruleId),
    ['boundaries/dependencies'],
  );
});

test('STYNX workspace: web packages are bound by package name too', async () => {
  const messages = await lintWorkspaceProbe(
    angularConfig,
    'packages-web/angular-ui',
    "export * from '@stynx-nyx/sdk';\n",
  );
  assert.deepEqual(
    messages.map((message) => message.ruleId),
    ['boundaries/dependencies'],
  );
});

test('STYNX workspace: domain API denies undeclared framework imports', async () => {
  const messages = await lintWorkspaceProbe(
    nestConfig,
    'domain/demo-bookmark/api',
    "export * from '@stynx-nyx/signature';\n",
  );
  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.severity]),
    [['boundaries/dependencies', 2]],
  );
});

test('STYNX workspace: framework code cannot import a domain package alias', async () => {
  const messages = await lintWorkspaceProbe(
    nestConfig,
    'packages/core',
    "export * from '@stynx-domain/demo-bookmark-api';\n",
  );
  assert.deepEqual(
    messages.map((message) => [message.ruleId, message.severity]),
    [['boundaries/dependencies', 2]],
  );
});

test('STYNX workspace: declared domain API imports stay clean', async () => {
  assert.deepEqual(
    await lintWorkspaceProbe(
      nestConfig,
      'domain/demo-bookmark/api',
      "export * from '@stynx-nyx/data';\n",
    ),
    [],
  );
});

test('STYNX workspace: domain API lint invokes the governed Nest profile', () => {
  const manifest = JSON.parse(
    readFileSync(join(workspaceRoot, 'domain/demo-bookmark/api/package.json'), 'utf8'),
  );
  assert.match(
    manifest.scripts.lint,
    /--config\s+['"]?\.\.\/\.\.\/\.\.\/tools\/eslint-config\/nest\.mjs(?:['"]|\s|$)/u,
  );
});

test('workspace redeclaration enforcement admits overloads and rejects duplicate implementations', async () => {
  const overload =
    'function convert(value: string): string; function convert(value: number): number; function convert(value: string | number): string | number { return value; }';
  const duplicate =
    'function duplicate(): number { return 1; } function duplicate(): number { return 2; }';
  for (const config of [libConfig, nestConfig, angularConfig]) {
    const rules = rulesOf(config);
    assert.equal(rules['no-redeclare'], 'off');
    assert.equal(rules['@typescript-eslint/no-redeclare'], 'error');
    const eslint = new ESLint({
      overrideConfigFile: true,
      overrideConfig: [
        {
          files: ['**/*.ts'],
          languageOptions: { parser: tsParser },
          plugins: { '@typescript-eslint': tsPlugin },
          rules: {
            'no-redeclare': rules['no-redeclare'],
            '@typescript-eslint/no-redeclare': rules['@typescript-eslint/no-redeclare'],
          },
        },
      ],
    });
    const [valid] = await eslint.lintText(overload, { filePath: 'overload.ts' });
    assert.deepEqual(valid.messages, []);
    const [invalid] = await eslint.lintText(duplicate, { filePath: 'duplicate.ts' });
    assert.deepEqual(
      invalid.messages.filter((message) => message.fatal),
      [],
    );
    assert.ok(
      invalid.messages.some(
        (message) => message.ruleId === '@typescript-eslint/no-redeclare' && message.severity === 2,
      ),
    );
  }
});
