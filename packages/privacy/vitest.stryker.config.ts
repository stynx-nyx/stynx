import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/privacy',
  include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/testing': resolve(__dirname, '../testing/src/index.ts'),
    '@stynx-nyx/privacy': resolve(__dirname, 'src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
    '@stynx-nyx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
  },
});
