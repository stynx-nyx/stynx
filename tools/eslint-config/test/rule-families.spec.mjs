// SM-03 acceptance: every enabled rule family has one fixture that makes
// `eslint --max-warnings=0` exit 1 naming that rule, and each profile has a
// clean fixture that exits 0. Each run lints from a throwaway consumer root
// that installs this package as `node_modules/@stynx-nyx/eslint-config`, so
// the profiles are exercised exactly as an adopter resolves them.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import libConfig from '../lib.mjs';
import nestConfig from '../nest.mjs';

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)));
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

test('STYNX workspace entry points keep the pre-SM-11 levels', () => {
  const rulesOf = (config) => Object.assign({}, ...config.map((item) => item.rules ?? {}));
  const libRules = rulesOf(libConfig);
  assert.equal(libRules['@typescript-eslint/no-explicit-any'], 'off');
  assert.equal(libRules['@typescript-eslint/no-unsafe-assignment'], 'off');
  assert.equal(libRules['boundaries/dependencies'][1].default, 'allow');
  assert.equal(libRules['stynx/no-authored-cjs'], undefined);
  // SM-13 raised the workspace level from warn to the published error level.
  assert.equal(rulesOf(nestConfig)['stynx/require-idempotent-route-decorator'], 'error');
});
