import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/test-packages',
  include: ['**/*.spec.ts'],
  coverageThreshold: { statements: 85, branches: 80, functions: 85, lines: 85 },
  alias: {
    '@nestjs/common': resolve(__dirname, 'node_modules/@nestjs/common'),
    '@nestjs/core': resolve(__dirname, 'node_modules/@nestjs/core'),
    '@stynx-nyx/auth': resolve(__dirname, 'support/auth-stub.ts'),
    '@stynx-nyx/audit': resolve(__dirname, '../../packages/audit/src/index.ts'),
    '@stynx-nyx/core': resolve(__dirname, '../../packages/core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, 'support/data-stub.ts'),
    '@stynx-nyx/health': resolve(__dirname, '../../packages/health/src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../../packages/idempotency/src/index.ts'),
    '@stynx-nyx/logging': resolve(__dirname, '../../packages/logging/src/index.ts'),
    '@stynx-nyx/ratelimit': resolve(__dirname, '../../packages/ratelimit/src/index.ts'),
    '@stynx-nyx/sessions': resolve(__dirname, '../../packages/sessions/src/index.ts'),
    '@stynx-nyx/storage': resolve(__dirname, '../../packages/storage/src/index.ts'),
    '@stynx-nyx/backend': resolve(__dirname, '../../packages/backend/src/index.ts'),
    '@stynx-nyx/contracts': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    '@stynx-nyx/sdk': resolve(__dirname, '../../packages-web/sdk/src/index.ts'),
  },
});
