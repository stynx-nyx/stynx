import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/feature-flags',
  include: ['test/unit/**/*.spec.ts'],
});
