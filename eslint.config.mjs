import js from '@eslint/js';
import angularPlugin from '@angular-eslint/eslint-plugin';
import angularTemplatePlugin from '@angular-eslint/eslint-plugin-template';
import angularTemplateParser from '@angular-eslint/template-parser';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

// Angular sources live only in these trees; backend NestJS packages use
// constructor injection and must NOT receive @angular-eslint rules here.
// The canonical per-package gates are tools/eslint-config/{nest,lib,...}.mjs;
// this root config exists for bare `eslint` consumers (lint-staged hook, IDE)
// and must stay in agreement with those gates (see R17 closeout, c5bc31357).
const angularFiles = ['packages-web/**/*.ts', 'reference/web/**/*.ts', 'domain/*/web/**/*.ts'];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/.angular/**',
      'docs/.docusaurus/**',
      'docs/build/**',
      // Codegen output (openapi-typescript-codegen) — never lint: the sdk
      // package lint ignores it, and eslint --fix here strips the generated
      // /* eslint-disable */ headers as "unused directives", making every
      // sdk build dirty the tree against the committed snapshot.
      'packages-web/sdk/src/generated/**',
    ],
  },
  {
    files: ['**/*.ts', '**/*.mts', '**/*.cts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      'no-undef': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: angularFiles,
    plugins: {
      '@angular-eslint': angularPlugin,
      '@angular-eslint/template': angularTemplatePlugin,
    },
    processor: angularTemplatePlugin.processors['extract-inline-html'],
    rules: {
      // angular-eslint 22 no longer ships flat configs on the plugin (they
      // moved to the `angular-eslint` umbrella package). This is the v21
      // `recommended` rule set spelled out, mirroring tools/eslint-config;
      // v22's one addition (prefer-on-push-component-change-detection) is
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
      '@angular-eslint/component-class-suffix': 'error',
      '@angular-eslint/no-input-rename': 'error',
      '@angular-eslint/no-output-on-prefix': 'error',
      '@angular-eslint/no-output-rename': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },
  {
    files: ['packages-web/**/*.html', 'reference/web/**/*.html', 'domain/*/web/**/*.html'],
    languageOptions: {
      parser: angularTemplateParser,
    },
    plugins: {
      '@angular-eslint/template': angularTemplatePlugin,
    },
    rules: {
      // v21 template `recommended` set, pinned explicitly; identical in v22.
      '@angular-eslint/template/banana-in-box': 'error',
      '@angular-eslint/template/eqeqeq': 'error',
      '@angular-eslint/template/no-negated-async': 'error',
      '@angular-eslint/template/prefer-control-flow': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'warn',
    },
  },
];
