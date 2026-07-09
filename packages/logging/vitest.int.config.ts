import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/logging',
  include: ['test/integration/**/*.spec.ts'],
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
  },
});
