// Workspace test-file ESLint config — CW-1 mutation-assertion guard rules.
//
// Does not require a per-package tsconfig.test.json: CW-1 rules are
// syntax-based (no type information needed). We use the TS parser without a
// `project:` reference so any package's test/ files can be linted directly
// from the workspace root via `pnpm lint:tests`.
//
// Severity is `'error'` so CI fails on violations once test-lint is wired
// into the per-package `lint:tests` scripts.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';

export default [
  {
    files: ['**/*.spec.ts', '**/*.test.ts', '**/*.spec.tsx', '**/*.test.tsx'],
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
