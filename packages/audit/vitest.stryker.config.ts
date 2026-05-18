import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

// Stryker mutation-test scope: unit + integration combined. Coverage
// thresholds zeroed because Stryker reports mutation score, not coverage.
export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/audit',
  include: ['test/unit/**/*.spec.ts', 'test/integration/**/*.spec.ts'],
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
  alias: {
    '@stynx/auth': resolve(__dirname, 'test/support/auth-stub.ts'),
    '@stynx/core': resolve(__dirname, '../core/src/index.ts'),
    '@stynx/data': resolve(__dirname, '../data/src/index.ts'),
  },
});
