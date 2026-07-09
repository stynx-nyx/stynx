import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/pdf-a',
  include: ['test/**/*.spec.ts'],
  coverageThreshold: { statements: 0, branches: 0, functions: 0, lines: 0 },
});
