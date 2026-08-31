import { typeOnlyCoverageExclusions } from '../../tools/repo-config/coverage-population.mjs';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/mobile-runtime',
  include: ['test/**/*.spec.ts'],
  coverageExclude: typeOnlyCoverageExclusions({
    packageDir: __dirname,
    candidates: ['src/ports.ts'],
  }),
});
