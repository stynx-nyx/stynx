import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx/pdf',
  include: ['test/unit/**/*.spec.ts', 'test/conformance/**/*.spec.ts'],
  singleThread: true,
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
});
