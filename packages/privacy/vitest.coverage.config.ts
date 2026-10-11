import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/privacy',
  include: ['test/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'],
  nativeCoverageModules: [
    { source: 'src/errors.ts', output: 'dist/privacy/src/errors.js' },
    { source: 'src/pii-map.service.ts', output: 'dist/privacy/src/pii-map.service.js' },
    { source: 'src/privacy-context.ts', output: 'dist/privacy/src/privacy-context.js' },
    {
      source: 'src/privacy-object-store.service.ts',
      output: 'dist/privacy/src/privacy-object-store.service.js',
    },
    {
      source: 'src/privacy-retention.guard.ts',
      output: 'dist/privacy/src/privacy-retention.guard.js',
    },
    { source: 'src/privacy.controller.ts', output: 'dist/privacy/src/privacy.controller.js' },
    { source: 'src/privacy.service.ts', output: 'dist/privacy/src/privacy.service.js' },
    { source: 'src/ropa.ts', output: 'dist/privacy/src/ropa.js' },
    { source: 'src/unconfigured-identity.ts', output: 'dist/privacy/src/unconfigured-identity.js' },
  ],
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/tokens.ts', '!src/privacy.module.ts'],
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/testing': resolve(__dirname, '../testing/src/index.ts'),
    '@stynx-nyx/privacy': resolve(__dirname, 'src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
  },
});
