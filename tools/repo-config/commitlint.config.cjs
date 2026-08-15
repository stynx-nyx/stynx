const CONVENTIONAL_TYPES = [
  'build',
  'chore',
  'ci',
  'docs',
  'feat',
  'fix',
  'perf',
  'refactor',
  'revert',
  'style',
  'test',
];

const allowedScopes = [
  'stynx-workspace',
  '@stynx-nyx/reference-api',
  '@stynx-nyx/reference-web',
  '@stynx-nyx/backend',
  '@stynx-nyx/contracts',
  '@stynx-nyx/auth',
  '@stynx-nyx/audit',
  '@stynx-nyx/cli',
  '@stynx-nyx/core',
  '@stynx-nyx/data',
  '@stynx-nyx/i18n',
  '@stynx-nyx/privacy',
  '@stynx-nyx/ratelimit',
  '@stynx-nyx/idempotency',
  '@stynx-nyx/health',
  '@stynx-nyx/logging',
  '@stynx-nyx/sessions',
  '@stynx-nyx/storage',
  '@stynx-nyx/tenancy',
  '@stynx-nyx/testing',
  '@stynx-nyx/angular',
  '@stynx-nyx/angular-tenancy',
  '@stynx-nyx/angular-auth',
  '@stynx-nyx/angular-ui',
  '@stynx-nyx/angular-i18n',
  '@stynx-nyx/angular-trash',
  '@stynx-nyx/angular-storage',
  '@stynx-nyx/angular-sessions',
  '@stynx-nyx/angular-profile',
  '@stynx-internal/eslint-config',
  '@stynx-internal/tsconfig',
  '@stynx-internal/migration-linter',
  'clean',
  'deps',
  'deps-dev',
  'repo',
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern: new RegExp(
        `^(${CONVENTIONAL_TYPES.join('|')})(?:\\(([@\\w$.\\-*/ ]*)\\))?!?: (.+)$`,
      ),
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    'type-enum': [2, 'always', CONVENTIONAL_TYPES],
    'scope-enum': [2, 'always', [...allowedScopes, '']],
    'subject-case': [0, 'never'],
    'subject-empty': [2, 'never'],
    'header-max-length': [2, 'always', 100],
    'header-trim': [2, 'always'],
  },
};

module.exports.allowedScopes = allowedScopes;
