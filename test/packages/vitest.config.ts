import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/test-packages',
  include: ['**/*.spec.ts'],
  coverageThreshold: { statements: 85, branches: 80, functions: 85, lines: 85 },
  alias: {
    '@nestjs/common': resolve(__dirname, 'node_modules/@nestjs/common'),
    '@nestjs/core': resolve(__dirname, 'node_modules/@nestjs/core'),
    '@stynx/auth': resolve(__dirname, 'support/auth-stub.ts'),
    '@stynx/audit': resolve(__dirname, '../../packages/audit/src/index.ts'),
    '@stynx/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    '@stynx/data': resolve(__dirname, 'support/data-stub.ts'),
    '@stynx/health': resolve(__dirname, '../../packages/health/src/index.ts'),
    '@stynx/idempotency': resolve(__dirname, '../../packages/idempotency/src/index.ts'),
    '@stynx/logging': resolve(__dirname, '../../packages/logging/src/index.ts'),
    '@stynx/ratelimit': resolve(__dirname, '../../packages/ratelimit/src/index.ts'),
    '@stynx/sessions': resolve(__dirname, '../../packages/sessions/src/index.ts'),
    '@stynx/storage': resolve(__dirname, '../../packages/storage/src/index.ts'),
    '@stynx/backend': resolve(__dirname, '../../packages/backend/src/index.ts'),
    '@stynx/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    '@stynx-web/sdk': resolve(__dirname, '../../packages-web/sdk/src/index.ts'),
  },
});
