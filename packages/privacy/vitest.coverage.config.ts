import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

const packageDir = dirname(fileURLToPath(import.meta.url));

export default createVitestConfig({
  packageDir: packageDir,
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
    '@stynx-nyx/core': resolve(packageDir, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(packageDir, '../data/src/index.ts'),
    '@stynx-nyx/testing': resolve(packageDir, '../testing/src/index.ts'),
    '@stynx-nyx/privacy': resolve(packageDir, 'src/index.ts'),
    '@stynx-nyx/idempotency': resolve(packageDir, '../idempotency/src/index.ts'),
  },
});
