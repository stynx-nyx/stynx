import js from '@eslint/js';
import { existsSync } from 'node:fs';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const currentPackageName = () => process.env.npm_package_name ?? '';

const deepImportPatterns = [
  {
    group: ['@stynx/*/*', '@stynx-web/*/*', '@stech/stynx-*/*'],
    message: 'Use barrel imports only; deep imports between workspace packages are forbidden.',
  },
];

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
  'no-restricted-imports': ['error', { patterns: deepImportPatterns }],
};

const pgPoolRule = (allow) => allow
  ? {}
  : {
      'no-restricted-imports': [
        'error',
        {
          patterns: deepImportPatterns,
          paths: [
            {
              name: 'pg',
              importNames: ['Pool'],
              message: 'Import pg.Pool only inside @stynx/data.',
            },
          ],
        },
      ],
    };

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
      stynx: stynxPlugin,
    },
    rules: {
      ...sharedTypescriptRules,
      ...pgPoolRule(allowPgPool || currentPackageName() === '@stynx/data'),
      ...s3FetchRule(allowS3Fetch || currentPackageName() === '@stynx/storage'),
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
