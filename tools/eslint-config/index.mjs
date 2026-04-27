import js from '@eslint/js';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import boundariesPlugin from 'eslint-plugin-boundaries';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const currentPackageName = () => process.env.npm_package_name ?? '';
const workspaceRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

const deepImportPatterns = [
  {
    group: ['@stynx/*/*', '@stynx-web/*/*'],
    message: 'Use barrel imports only; deep imports between workspace packages are forbidden.',
  },
];

const pgImportPaths = ['pg', 'pg-pool', 'pg-native', 'node-postgres'].map((name) => ({
  name,
  message: 'Raw PostgreSQL imports are only allowed inside @stynx/data and @stynx/cli.',
}));

const s3ImportPatterns = [
  {
    group: ['@aws-sdk/client-s3*'],
    message: 'Direct S3 SDK imports are only allowed inside @stynx/storage.',
  },
];

const boundaryElements = [
  { type: 'core', pattern: 'packages/core/src/**' },
  { type: 'contracts', pattern: 'packages/contracts/src/**' },
  { type: 'foundation', pattern: 'packages/{tenancy,logging,health}/src/**' },
  { type: 'data', pattern: 'packages/data/src/**' },
  { type: 'sessions', pattern: 'packages/sessions/src/**' },
  { type: 'auth', pattern: 'packages/auth/src/**' },
  { type: 'platform', pattern: 'packages/{audit,storage,ratelimit,idempotency,backend}/src/**' },
  { type: 'experience', pattern: 'packages/{privacy,i18n}/src/**' },
  { type: 'tooling', pattern: 'packages/{testing,cli}/src/**' },
  { type: 'web', pattern: 'packages-web/*/src/**' },
  { type: 'app', pattern: 'apps/*/src/**' },
];

const tsdocPackages = new Set([
  '@stynx/core',
  '@stynx/auth',
  '@stynx/data',
  '@stynx/storage',
  '@stynx/audit',
  '@stynx/sessions',
  '@stynx/tenancy',
  '@stynx/privacy',
]);

const writeRouteDecoratorNames = new Set(['Post', 'Put', 'Patch']);
const idempotencyDecoratorNames = new Set(['Idempotent', 'NoIdempotent']);

function getDecoratorName(decorator) {
  const expression = decorator.expression;
  if (!expression) return null;
  if (expression.type === 'Identifier') {
    return expression.name;
  }
  if (expression.type === 'CallExpression') {
    if (expression.callee.type === 'Identifier') {
      return expression.callee.name;
    }
    if (
      expression.callee.type === 'MemberExpression' &&
      expression.callee.property.type === 'Identifier'
    ) {
      return expression.callee.property.name;
    }
  }
  return null;
}

function collectDecoratorNames(node) {
  if (!Array.isArray(node.decorators)) return [];
  return node.decorators
    .map((decorator) => getDecoratorName(decorator))
    .filter((name) => typeof name === 'string');
}

const stynxPlugin = {
  rules: {
    'require-package-index-tsdoc': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Require package barrel files to carry package-level TSDoc.',
        },
        schema: [],
        messages: {
          missingPackageDocs:
            'Package public barrel must start with a TSDoc @packageDocumentation block.',
        },
      },
      create(context) {
        return {
          Program(node) {
            const sourceCode = context.sourceCode;
            const firstComment = sourceCode.getAllComments()[0];
            if (
              firstComment?.type === 'Block' &&
              firstComment.value.includes('*') &&
              firstComment.value.includes('@packageDocumentation')
            ) {
              return;
            }

            context.report({
              node,
              messageId: 'missingPackageDocs',
            });
          },
        };
      },
    },
    'require-idempotent-route-decorator': {
      meta: {
        type: 'suggestion',
        docs: {
          description: 'Warn on POST/PUT/PATCH routes without @Idempotent() or @NoIdempotent().',
        },
        schema: [],
        messages: {
          missingDecorator:
            'POST/PUT/PATCH routes should declare @Idempotent() or @NoIdempotent().',
        },
      },
      create(context) {
        return {
          MethodDefinition(node) {
            const routeDecorators = collectDecoratorNames(node).filter((name) =>
              writeRouteDecoratorNames.has(name),
            );
            if (routeDecorators.length === 0) {
              return;
            }

            const methodDecorators = collectDecoratorNames(node);
            if (methodDecorators.some((name) => idempotencyDecoratorNames.has(name))) {
              return;
            }

            const classDecorators = collectDecoratorNames(node.parent?.parent);
            if (classDecorators.some((name) => idempotencyDecoratorNames.has(name))) {
              return;
            }

            context.report({
              node,
              messageId: 'missingDecorator',
            });
          },
        };
      },
    },
  },
};

const sharedTypescriptRules = {
  ...js.configs.recommended.rules,
  ...tsPlugin.configs.recommended.rules,
  'no-undef': 'off',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
};

const restrictedImportsRule = ({ allowPgImports, allowS3Imports }) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        ...deepImportPatterns,
        ...(allowS3Imports ? [] : s3ImportPatterns),
      ],
      paths: allowPgImports ? [] : pgImportPaths,
    },
  ],
});

const s3FetchRule = (allow) => allow
  ? {}
  : {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal:first-child[value=/https?:\\/\\/.*s3[.-].*/]",
          message: 'Fetch calls to direct S3 URLs are only allowed inside @stynx/storage.',
        },
      ],
    };

const resolveTsconfigProject = (tsconfig) => {
  if (Array.isArray(tsconfig)) {
    const existing = tsconfig.filter((candidate) => existsSync(candidate));
    return existing.length > 0 ? existing : [tsconfig[tsconfig.length - 1]];
  }

  return tsconfig;
};

const createConfig = ({ files, tsconfig = './tsconfig.json', browser = false, nest = false, angular = false, allowPgPool = false, allowS3Fetch = false }) => [
  {
    ignores: ['dist/**', 'build/**', 'coverage/**', 'node_modules/**', '.angular/**'],
  },
  {
    files,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: resolveTsconfigProject(tsconfig),
        tsconfigRootDir: process.cwd(),
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: browser ? globals.browser : globals.node,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      boundaries: boundariesPlugin,
      jsdoc: jsdocPlugin,
      stynx: stynxPlugin,
    },
    settings: {
      'boundaries/root-path': workspaceRoot,
      'boundaries/elements': boundaryElements,
    },
    rules: {
      ...sharedTypescriptRules,
      ...restrictedImportsRule({
        allowPgImports: allowPgPool || ['@stynx/data', '@stynx/cli'].includes(currentPackageName()),
        allowS3Imports: currentPackageName() === '@stynx/storage',
      }),
      ...s3FetchRule(allowS3Fetch || currentPackageName() === '@stynx/storage'),
      'boundaries/dependencies': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: { type: '*' },
              disallow: { to: { type: '*', internalPath: 'internal/**' } },
              message: 'Internal workspace modules may only be imported by their owning package.',
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      ...(nest
        ? {
            '@typescript-eslint/no-extraneous-class': 'off',
          }
        : {}),
      ...(angular
        ? {
            '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
          }
        : {}),
      ...(nest
        ? {
            'stynx/require-idempotent-route-decorator': 'warn',
          }
        : {}),
    },
  },
  {
    files: ['src/index.ts'],
    rules: tsdocPackages.has(currentPackageName())
      ? {
          'jsdoc/require-jsdoc': [
            'error',
            {
              contexts: ['ExportAllDeclaration', 'ExportNamedDeclaration'],
              publicOnly: true,
            },
          ],
          'stynx/require-package-index-tsdoc': 'error',
        }
      : {},
  },
  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

export const createLibConfig = (options = {}) => createConfig({ files: ['src/**/*.ts', 'lib/**/*.ts'], ...options });
export const createNestConfig = (options = {}) => createConfig({ files: ['src/**/*.ts'], nest: true, ...options });
export const createAngularConfig = (options = {}) =>
  createConfig({
    files: ['src/**/*.ts'],
    browser: true,
    angular: true,
    tsconfig: ['./tsconfig.app.json', './tsconfig.json'],
    ...options,
  });

export default {
  createLibConfig,
  createNestConfig,
  createAngularConfig,
};
