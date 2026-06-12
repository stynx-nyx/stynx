import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/flow',
  include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  passWithNoTests: true,
  alias: {
    '@stynx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx/backend': resolve(__dirname, '../backend/src/index.ts'),
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx/testing': resolve(__dirname, '../testing/src/index.ts'),
  },
});
