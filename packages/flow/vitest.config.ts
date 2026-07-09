import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

const cfg = createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/flow',
  include: ['test/unit/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'],
  alias: {
    '@stynx-nyx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx-nyx/backend': resolve(__dirname, '../backend/src/index.ts'),
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx-nyx/testing': resolve(__dirname, '../testing/src/index.ts'),
  },
});

(cfg as any).test = { ...(cfg as any).test, passWithNoTests: true };
export default cfg;
