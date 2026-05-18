import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/backend',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx/audit': resolve(__dirname, '../audit/src/index.ts'),
    '@stynx/contracts': resolve(__dirname, '../contracts/src/index.ts'),
    '@stynx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
    '@stynx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
    '@stynx/storage': resolve(__dirname, '../storage/src/index.ts'),
    '@stynx/ratelimit': resolve(__dirname, '../ratelimit/src/index.ts'),
    '@stynx/tenancy': resolve(__dirname, '../tenancy/src/index.ts'),
    '@stynx/health': resolve(__dirname, '../health/src/index.ts'),
    '@stynx/logging': resolve(__dirname, '../logging/src/index.ts'),
    '@stynx/i18n': resolve(__dirname, '../i18n/src/index.ts'),
    '@stynx/privacy': resolve(__dirname, '../privacy/src/index.ts'),
  },
});
