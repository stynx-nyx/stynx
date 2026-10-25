import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stynxPlugin } from './plugin.mjs';
import nodeProject from './tsconfig.workspace-node-implementation.json' with { type: 'json' };

const directory = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(directory, '../..');
const recommended = tsPlugin.configs.recommended;
if (!recommended) throw new Error('Installed TypeScript ESLint plugin has no recommended config.');
const recommendedRules = recommended.rules;
if (!recommendedRules) throw new Error('Installed TypeScript ESLint recommended config has no rules.');

export const workspaceImplementationFiles = nodeProject.files.map((file) =>
  relative(rootDir, resolve(directory, file)).replaceAll('\\', '/'));
const commonJsFiles = workspaceImplementationFiles.filter((file) => file.endsWith('.cjs'));
const moduleFiles = workspaceImplementationFiles.filter((file) => !file.endsWith('.cjs'));

// Retain native execution formats of the existing maintained Node tools. This
// private source route does not change the published scripts/test factories.
/** @type {Array<{ files: string[], sourceType: 'module' | 'commonjs' }>} */
const groups = [
  { files: moduleFiles, sourceType: 'module' },
  { files: commonJsFiles, sourceType: 'commonjs' },
];

export const workspaceImplementationConfig = groups.map(({ files, sourceType }) => ({
  basePath: rootDir,
  files,
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: resolve(directory, 'tsconfig.workspace-node-implementation.json'),
      tsconfigRootDir: rootDir,
      ecmaVersion: 2022,
      sourceType,
    },
    sourceType,
    globals: globals.node,
  },
  plugins: { '@typescript-eslint': tsPlugin, stynx: stynxPlugin },
  rules: {
    ...js.configs.recommended.rules,
    ...Object.fromEntries(Object.entries(recommendedRules).filter(([rule]) =>
      sourceType !== 'commonjs' || rule !== '@typescript-eslint/no-require-imports')),
    'no-undef': 'off',
    'no-redeclare': 'off',
    '@typescript-eslint/no-redeclare': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
    ...Object.fromEntries(Object.keys(tsPlugin.rules)
      .filter((name) => name.startsWith('no-unsafe-'))
      .map((name) => [`@typescript-eslint/${name}`, 'error'])),
    ...(sourceType === 'module' ? { 'stynx/no-authored-cjs': 'error' } : {}),
    'stynx/no-raw-query': ['error', { rootDir }],
    'stynx/define-query-location': ['error', { rootDir }],
  },
}));
