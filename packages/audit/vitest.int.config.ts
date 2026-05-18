import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/audit',
  include: ['test/integration/**/*.spec.ts'],
  alias: {
    '@stynx/auth': resolve(__dirname, 'test/support/auth-stub.ts'),
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
  },
});
