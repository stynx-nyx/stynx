import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/testing',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx/audit': resolve(__dirname, '../audit/src/index.ts'),
    '@stynx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
    '@stynx/storage': resolve(__dirname, '../storage/src/index.ts'),
    '@stynx/testing': resolve(__dirname, 'src/index.ts'),
  },
});
