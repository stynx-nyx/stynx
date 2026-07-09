import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/auth',
  include: ['test/unit/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'],
  alias: {
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/idempotency': resolve(__dirname, '../idempotency/src/index.ts'),
    '@stynx-nyx/sessions': resolve(__dirname, '../sessions/src/index.ts'),
    '@stynx-nyx/auth': resolve(__dirname, 'src/index.ts'),
  },
});
