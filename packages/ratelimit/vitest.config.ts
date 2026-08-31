import { resolve } from 'node:path';
import { typeOnlyCoverageExclusions } from '../../tools/repo-config/coverage-population.mjs';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/ratelimit',
  include: ['test/unit/**/*.spec.ts'],
  coverageExclude: typeOnlyCoverageExclusions({
    packageDir: __dirname,
    candidates: ['src/request-context.ts'],
  }),
  alias: {
    '@stynx-nyx/auth': resolve(__dirname, '../auth/src/decorators.ts'),
    '@stynx-nyx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx-nyx/data': resolve(__dirname, '../data/src/index.ts'),
  },
});
