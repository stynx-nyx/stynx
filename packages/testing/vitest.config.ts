import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/testing',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx-nyx/audit': resolve(__dirname, '../audit/src/index.ts'),
    '@stynx-nyx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
    '@stynx-nyx/storage': resolve(__dirname, '../storage/src/index.ts'),
    '@stynx-nyx/testing': resolve(__dirname, 'src/index.ts'),
  },
});
