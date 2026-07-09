import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/backend',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx-nyx/audit': resolve(__dirname, '../audit/src/index.ts'),
    '@stynx-nyx/contracts': resolve(__dirname, '../contracts/src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
    '@stynx-nyx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
    '@stynx-nyx/storage': resolve(__dirname, '../storage/src/index.ts'),
    '@stynx-nyx/ratelimit': resolve(__dirname, '../ratelimit/src/index.ts'),
    '@stynx-nyx/tenancy': resolve(__dirname, '../tenancy/src/index.ts'),
    '@stynx-nyx/health': resolve(__dirname, '../health/src/index.ts'),
    '@stynx-nyx/logging': resolve(__dirname, '../logging/src/index.ts'),
    '@stynx-nyx/i18n': resolve(__dirname, '../i18n/src/index.ts'),
    '@stynx-nyx/privacy': resolve(__dirname, '../privacy/src/index.ts'),
  },
});
