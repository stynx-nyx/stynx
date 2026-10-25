import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import { stynxPlugin } from './plugin.mjs';

const recommended = tsPlugin.configs.recommended;
if (!recommended) throw new Error('Installed TypeScript ESLint plugin has no recommended config.');

const rootDir = fileURLToPath(new URL('../../', import.meta.url));
const groups = [
  {
    files: ['tools/eslint-config/*.mjs'],
    project: 'tsconfig.workspace-eslint.json',
  },
  {
    files: ['packages-web/sdk/codegen/*.mjs', 'packages-web/sdk/scripts/*.mjs', 'packages/cli/engines/*.mjs'],
    project: 'tsconfig.workspace-generators.json',
  },
];

// Workspace-only coverage of real implementation modules. The public plain-JS
// scripts and syntax-test factories retain their existing contracts.
export const workspaceToolingConfig = groups.map(({ files, project }) => ({
  basePath: rootDir,
  files,
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: fileURLToPath(new URL(project, import.meta.url)),
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
}));

export default workspaceToolingConfig;
