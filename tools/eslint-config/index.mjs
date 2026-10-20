import js from '@eslint/js';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import angularPlugin from '@angular-eslint/eslint-plugin';
import angularTemplatePlugin from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import boundariesPlugin from 'eslint-plugin-boundaries';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { stynxPlugin } from './plugin.mjs';

const currentPackageName = () => process.env.npm_package_name ?? '';

const deepImportPatterns = [
  {
    regex: '^@stynx-nyx/[^/]+/(?!catalogs/(?:en|pt-BR)\\.json$).+',
    message: 'Use barrel imports only; deep imports between workspace packages are forbidden.',
  },
];

const pgImportPaths = ['pg', 'pg-pool', 'pg-native', 'node-postgres'].map((name) => ({
  name,
  message: 'Raw PostgreSQL imports are only allowed inside @stynx-nyx/data and @stynx-nyx/cli.',
}));

const s3ImportPatterns = [
  {
    group: ['@aws-sdk/client-s3*'],
    message: 'Direct S3 SDK imports are only allowed inside @stynx-nyx/storage.',
  },
];

const tsdocPackages = new Set([
  '@stynx-nyx/core',
  '@stynx-nyx/auth',
  '@stynx-nyx/data',
  '@stynx-nyx/storage',
  '@stynx-nyx/audit',
  '@stynx-nyx/sessions',
  '@stynx-nyx/tenancy',
  '@stynx-nyx/privacy',
  '@stynx-nyx/backend',
  '@stynx-nyx/cli',
  '@stynx-nyx/contracts',
  '@stynx-nyx/feature-flags',
  '@stynx-nyx/flow',
  '@stynx-nyx/health',
  '@stynx-nyx/i18n',
  '@stynx-nyx/idempotency',
  '@stynx-nyx/integration-adapter',
  '@stynx-nyx/logging',
  '@stynx-nyx/pdf',
  '@stynx-nyx/pdf-a',
  '@stynx-nyx/pdf-a-vera-docker',
  '@stynx-nyx/ratelimit',
  '@stynx-nyx/signature',
  '@stynx-nyx/testing',
  '@stynx-nyx/angular',
  '@stynx-nyx/angular-audit',
  '@stynx-nyx/angular-auth',
  '@stynx-nyx/angular-flow',
  '@stynx-nyx/angular-i18n',
  '@stynx-nyx/angular-iam',
  '@stynx-nyx/angular-profile',
  '@stynx-nyx/angular-sessions',
  '@stynx-nyx/angular-storage',
  '@stynx-nyx/angular-tenancy',
  '@stynx-nyx/angular-trash',
  '@stynx-nyx/angular-ui',
  '@stynx-nyx/sdk',
]);

const tsdocExportContexts = ['ExportAllDeclaration', 'ExportNamedDeclaration'];
const tsdocExportContextsForPackage = () =>
  currentPackageName() === '@stynx-nyx/sdk'
    ? [
        "ExportAllDeclaration[source.value!='./generated']",
        "ExportNamedDeclaration[source.value!='./generated']",
      ]
    : tsdocExportContexts;

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
      patterns: [...deepImportPatterns, ...(allowS3Imports ? [] : s3ImportPatterns)],
      paths: allowPgImports ? [] : pgImportPaths,
    },
  ],
});

const s3FetchRule = (allow) =>
  allow
    ? {}
    : {
        'no-restricted-syntax': [
          'error',
          {
            selector:
              "CallExpression[callee.name='fetch'] > Literal:first-child[value=/https?:\\/\\/.*s3[.-].*/]",
            message: 'Fetch calls to direct S3 URLs are only allowed inside @stynx-nyx/storage.',
          },
        ],
      };

// D-013: `no-explicit-any` and every `no-unsafe-*` rule the installed
// typescript-eslint plugin ships, at error. Derived from the plugin so a new
// `no-unsafe-*` rule is enabled by the upgrade that introduces it.
const unsafeTypeRuleNames = Object.keys(tsPlugin.rules)
  .filter((name) => name.startsWith('no-unsafe-'))
  .sort()
  .map((name) => `@typescript-eslint/${name}`);

const typeSafetyRules = (strict) =>
  strict
    ? {
        '@typescript-eslint/no-explicit-any': 'error',
        ...Object.fromEntries(unsafeTypeRuleNames.map((name) => [name, 'error'])),
      }
    : {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      };

const internalBoundaryRule = {
  from: { type: '*' },
  disallow: { to: { type: '*', internalPath: 'internal/**' } },
  message: 'Internal workspace modules may only be imported by their owning package.',
};

// Strict profiles deny every dependency between declared elements unless the
// consumer allows it (S-37); the workspace profile keeps STYNX's allow default.
const boundaryDependenciesRule = (strict, allow) => [
  'error',
  {
    default: strict ? 'disallow' : 'allow',
    rules: [internalBoundaryRule, ...(strict ? allow : [])],
  },
];

// Strict profiles resolve relative TypeScript imports so boundaries can
// classify them (see import-resolver.mjs); bare specifiers use `node`.
const importResolverPath = fileURLToPath(new URL('./import-resolver.mjs', import.meta.url));
const importResolverSettings = (strict) =>
  strict ? { 'import/resolver': { [importResolverPath]: {}, node: {} } } : {};

const authoredCommonJsRule = (strict) => (strict ? { 'stynx/no-authored-cjs': 'error' } : {});

const resolveTsconfigProject = (tsconfig, rootDir) => {
  if (Array.isArray(tsconfig)) {
    const existing = tsconfig.filter((candidate) => existsSync(resolve(rootDir, candidate)));
    return existing.length > 0 ? existing : [tsconfig[tsconfig.length - 1]];
  }

  return tsconfig;
};

const createConfig = ({
  files,
  tsconfig = './tsconfig.json',
  browser = false,
  nest = false,
  angular = false,
  allowPgPool = false,
  allowS3Fetch = false,
  processor = undefined,
  strict = true,
  rootDir = process.cwd(),
  boundaries: { rootPath = rootDir, elements = [], allow = [] } = {},
}) => [
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'node_modules/**',
      '.angular/**',
      // Generated OpenAPI SDK output carries its own codegen marker and is
      // intentionally excluded; only the hand-authored SDK facade is documented.
      'src/generated/**',
    ],
  },
  {
    files,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: resolveTsconfigProject(tsconfig, rootDir),
        tsconfigRootDir: rootDir,
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: browser ? globals.browser : globals.node,
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      '@angular-eslint': angularPlugin,
      '@angular-eslint/template': angularTemplatePlugin,
      boundaries: boundariesPlugin,
      jsdoc: jsdocPlugin,
      stynx: stynxPlugin,
    },
    ...(processor ? { processor } : {}),
    settings: {
      'boundaries/root-path': rootPath,
      'boundaries/elements': elements,
      ...importResolverSettings(strict),
    },
    rules: {
      ...sharedTypescriptRules,
      ...restrictedImportsRule({
        allowPgImports:
          allowPgPool || ['@stynx-nyx/data', '@stynx-nyx/cli'].includes(currentPackageName()),
        allowS3Imports: currentPackageName() === '@stynx-nyx/storage',
      }),
      ...s3FetchRule(allowS3Fetch || currentPackageName() === '@stynx-nyx/storage'),
      'boundaries/dependencies': boundaryDependenciesRule(strict, allow),
      ...typeSafetyRules(strict),
      ...authoredCommonJsRule(strict),
      ...(nest
        ? {
            '@typescript-eslint/no-extraneous-class': 'off',
          }
        : {}),
      ...(angular
        ? {
            // angular-eslint 22 no longer ships flat configs on the plugin
            // (they moved to the `angular-eslint` umbrella package). This is
            // the v21 `recommended` rule set spelled out, so the lint
            // contract is pinned here instead of inherited; the v22 change
            // to that set (prefer-on-push-component-change-detection) is
            // already enforced explicitly below.
            '@angular-eslint/contextual-lifecycle': 'error',
            '@angular-eslint/no-empty-lifecycle-method': 'error',
            '@angular-eslint/no-inputs-metadata-property': 'error',
            '@angular-eslint/no-output-native': 'error',
            '@angular-eslint/no-outputs-metadata-property': 'error',
            '@angular-eslint/prefer-inject': 'error',
            '@angular-eslint/prefer-standalone': 'error',
            '@angular-eslint/use-lifecycle-interface': 'warn',
            '@angular-eslint/use-pipe-transform-interface': 'error',
            '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
            '@angular-eslint/component-class-suffix': 'error',
            '@angular-eslint/no-input-rename': 'error',
            '@angular-eslint/no-output-on-prefix': 'error',
            '@angular-eslint/no-output-rename': 'error',
            '@angular-eslint/prefer-on-push-component-change-detection': 'error',
          }
        : {}),
      ...(nest
        ? {
            'stynx/require-idempotent-route-decorator': 'error',
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
              contexts: tsdocExportContextsForPackage(),
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
  ...(angular
    ? [
        {
          files: ['**/*.html'],
          languageOptions: {
            parser: angularTemplateParser,
          },
          plugins: {
            '@angular-eslint/template': angularTemplatePlugin,
          },
          rules: {
            // v21 template `recommended` set, pinned explicitly (see above);
            // identical in v22.
            '@angular-eslint/template/banana-in-box': 'error',
            '@angular-eslint/template/eqeqeq': 'error',
            '@angular-eslint/template/no-negated-async': 'error',
            '@angular-eslint/template/prefer-control-flow': 'error',
            '@angular-eslint/template/click-events-have-key-events': 'warn',
          },
        },
      ]
    : []),
];

export const createLibConfig = (options = {}) =>
  createConfig({ files: ['src/**/*.ts', 'lib/**/*.ts'], ...options });
export const createNestConfig = (options = {}) =>
  createConfig({ files: ['src/**/*.ts'], nest: true, ...options });
export const createAngularConfig = (options = {}) =>
  createConfig({
    files: ['src/**/*.ts'],
    browser: true,
    angular: true,
    tsconfig: ['./tsconfig.app.json', './tsconfig.json'],
    processor: angularTemplatePlugin.processors['extract-inline-html'],
    ...options,
  });

const scriptIgnores = ['dist/**', 'build/**', 'coverage/**', 'node_modules/**'];

// Plain JavaScript tooling (build and repository scripts). Strict profiles lint
// every script as ESM and forbid authored CommonJS (D-057); the workspace
// profile keeps STYNX's CommonJS `.js`/`.cjs` scripts until SM-01 lands.
export const createScriptsConfig = ({ strict = true, files } = {}) =>
  strict
    ? [
        { ignores: scriptIgnores },
        {
          files: files ?? ['**/*.js', '**/*.mjs', '**/*.cjs'],
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
          },
          plugins: {
            stynx: stynxPlugin,
          },
          rules: {
            ...js.configs.recommended.rules,
            ...authoredCommonJsRule(strict),
          },
        },
      ]
    : [
        { ignores: scriptIgnores },
        {
          files: ['**/*.js', '**/*.cjs'],
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: globals.node,
          },
          rules: {
            ...js.configs.recommended.rules,
          },
        },
        {
          files: ['**/*.mjs'],
          languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: globals.node,
          },
          rules: {
            ...js.configs.recommended.rules,
          },
        },
      ];

// Test-file profile: CW-1 mutation-assertion guard rules (S-60).
//
// Does not require a per-package tsconfig.test.json: CW-1 rules are
// syntax-based (no type information needed). We use the TS parser without a
// `project:` reference so any package's test/ files can be linted directly
// from the workspace root via `pnpm lint:tests`.
export const createTestConfig = ({
  files = ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx'],
} = {}) => [
  {
    files,
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage*/**', '**/.stryker-tmp/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        // No `project:` — keeps the parser fast and unblocks per-package
        // lint:tests without a tsconfig.test.json.
      },
      globals: {
        ...globals.node,
        ...globals.browser,
        ...globals.jest,
        // Vitest globals — used by every spec without imports.
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        // Allow plain `Mock<...>` type imports as a global reference symbol.
        Mock: 'readonly',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      // CW-1 — ban mutation-assertion anti-patterns. Severity 'error' enforces
      // the policy across all test files; flip to 'warn' temporarily during a
      // remediation pass if needed.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name='toHaveBeenCalled'][arguments.length=0]:not([callee.object.property.name='not'])",
          message:
            'WAVE-05A/CW-1: Use .toHaveBeenCalledWith(...) instead of bare .toHaveBeenCalled(); the bare form does not catch argument-shape mutations.',
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^toBe(Truthy|Falsy|Defined|Undefined|Null|NaN)$/][arguments.length=0]",
          message:
            'WAVE-05A/CW-1: Use a value assertion (.toBe(x) / .toEqual(...) / .toMatch(/.../)) instead of an existence-only assertion; existence assertions survive most mutations.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../../../*/src',
                '../../../*/src/*',
                '../../../../*/src',
                '../../../../*/src/*',
              ],
              message:
                'R19-W06: Import sibling packages through their package name and test alias, not relative */src paths.',
            },
          ],
        },
      ],
    },
  },
];
