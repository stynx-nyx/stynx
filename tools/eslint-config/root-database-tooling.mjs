import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import { stynxPlugin } from './plugin.mjs';

const recommended = tsPlugin.configs.recommended;
if (!recommended) throw new Error('Installed TypeScript ESLint plugin has no recommended config.');

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const actualImplementations = [
  'scripts/lib/demo-bookmark-storage.mjs',
  'scripts/offline-storage-catalog-generate.mjs',
  'scripts/outbox-storage-catalog-generate.mjs',
  'scripts/ci-local/prepare-int-template.mjs',
];

// Deliberately includes the actual MJS implementations even when a sibling
// declaration exists. No default-project admission or runtime paths mapping.
export const rootDatabaseToolingConfig = [{
  basePath: rootDir,
  files: actualImplementations,
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: fileURLToPath(new URL('../database-tooling/tsconfig.root-scripts.json', import.meta.url)),
      tsconfigRootDir: rootDir,
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    globals: globals.node,
  },
  plugins: { '@typescript-eslint': tsPlugin, stynx: stynxPlugin },
  rules: {
    ...js.configs.recommended.rules,
    ...recommended.rules,
    'no-undef': 'off',
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    ...Object.fromEntries(Object.keys(tsPlugin.rules)
      .filter((name) => name.startsWith('no-unsafe-'))
      .map((name) => [`@typescript-eslint/${name}`, 'error'])),
    'stynx/no-authored-cjs': 'error',
    'stynx/no-raw-query': ['error', { rootDir }],
    'stynx/define-query-location': ['error', { rootDir }],
  },
}];
