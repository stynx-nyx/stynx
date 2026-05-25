import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/signature',
  include: ['test/**/*.spec.ts'],
  alias: {
    '@stynx/integration-adapter': resolve(__dirname, '../integration-adapter/src/index.ts'),
  },
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
});
