import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import globals from 'globals';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const tsconfigRootDir = fileURLToPath(new URL('.', import.meta.url));

export default [
  {
    files: ['src/**/*.ts'],
    ignores: ['src/environments/environment*.ts'],
    languageOptions: {
      parser,
      parserOptions: {
        project: path.join(tsconfigRootDir, 'tsconfig.app.json'),
        tsconfigRootDir,
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tseslint.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];
