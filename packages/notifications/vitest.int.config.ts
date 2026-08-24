import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/notifications',
  include: ['test/integration/**/*.spec.ts'],
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/i18n': resolve(__dirname, '../i18n/src/index.ts'),
    '@stynx-nyx/preferences': resolve(__dirname, '../preferences/src/index.ts'),
    '@stynx-nyx/integration-adapter': resolve(__dirname, '../integration-adapter/src/index.ts'),
    '@stynx-nyx/logging': resolve(__dirname, '../logging/src/index.ts'),
  },
});
