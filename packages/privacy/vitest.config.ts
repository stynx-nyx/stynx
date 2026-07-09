import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/privacy',
  include: ['test/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/tokens.ts',
    '!src/privacy.module.ts',
  ],
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/testing': resolve(__dirname, '../testing/src/index.ts'),
    '@stynx-nyx/privacy': resolve(__dirname, 'src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
  },
});
