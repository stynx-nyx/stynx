import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

const cfg = createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/flow',
  include: ['test/unit/**/*.spec.ts'],
  alias: {
    '@stynx/auth': resolve(__dirname, '../auth/src/index.ts'),
    '@stynx/backend': resolve(__dirname, '../backend/src/index.ts'),
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
  },
});

(cfg as any).test = { ...(cfg as any).test, passWithNoTests: true };
export default cfg;
