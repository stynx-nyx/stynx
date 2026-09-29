import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

// Coverage must observe the PostgreSQL durable store through its real DB
// integration sensors. Keep the ordinary package test tier fast and isolated.
const coverageRun = process.argv.includes('--coverage');

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/offline-sync',
  include: [
    'test/unit/**/*.spec.ts',
    'test/wiring/**/*.wiring-spec.ts',
    ...(coverageRun ? ['test/integration/**/*.integration.spec.ts'] : []),
  ],
  sequentialFiles: coverageRun,
  alias: {
    '@stynx-nyx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx-nyx/backend': resolve(__dirname, '../backend/src/index.ts'),
    '@stynx-nyx/contracts': resolve(__dirname, '../contracts/src/index.ts'),
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
    '@stynx-nyx/ratelimit': resolve(__dirname, '../ratelimit/src/index.ts'),
    '@stynx-nyx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
  },
});
