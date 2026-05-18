import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/privacy',
  include: ['test/integration/**/*.spec.ts'],
  alias: {
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx/privacy': resolve(__dirname, 'src/index.ts'),
    '@stynx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
    '@stynx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
    '@stynx/testing': resolve(__dirname, '../testing/src/index.ts'),
  },
});
