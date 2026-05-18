import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/privacy',
  include: ['test/**/*.spec.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/index.ts',
    '!src/tokens.ts',
    '!src/errors.ts',
    '!src/pii-map.service.ts',
    '!src/privacy.controller.ts',
    '!src/privacy.module.ts',
    '!src/privacy-object-store.service.ts',
    '!src/ropa.ts',
  ],
  alias: {
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx/testing': resolve(__dirname, '../testing/src/index.ts'),
    '@stynx/privacy': resolve(__dirname, 'src/index.ts'),
    '@stynx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
  },
});
