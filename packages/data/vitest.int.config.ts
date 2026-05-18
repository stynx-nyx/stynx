import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/data',
  include: ['test/integration/**/*.spec.ts'],
  singleThread: true,
  patchDrizzle: true,
  alias: {
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, 'src/index.ts'),
  },
});
