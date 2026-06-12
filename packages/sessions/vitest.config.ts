import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/sessions',
  include: ['test/unit/**/*.spec.ts', 'test/wiring/**/*.wiring-spec.ts'],
  alias: {
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
    '@stynx/sessions': resolve(__dirname, 'src/index.ts'),
  },
});
