import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/test-db',
  include: ['**/*.spec.ts'],
  coverageThreshold: { statements: 85, branches: 80, functions: 85, lines: 85 },
});
