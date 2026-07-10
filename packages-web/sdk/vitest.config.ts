import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/sdk',
  alias: {
    '@stynx-nyx/sdk': resolve(__dirname, 'src/index.ts'),
  },
});
