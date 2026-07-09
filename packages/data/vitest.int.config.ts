// @ts-nocheck
import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/data',
  include: ['test/integration/**/*.spec.ts'],
  singleThread: true,
  patchDrizzle: true,
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, 'src/index.ts'),
  },
});
