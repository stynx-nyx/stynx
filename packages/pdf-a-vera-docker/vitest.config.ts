import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/pdf-a-vera-docker',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx/pdf-a': resolve(__dirname, '../pdf-a/src/index.ts'),
    '@stynx/logging': resolve(__dirname, '../logging/src/index.ts'),
  },
  singleThread: true,
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  testTimeout: 420000,
});
