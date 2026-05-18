import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-web/sdk',
  alias: {
    '@stynx-web/sdk': resolve(__dirname, 'src/index.ts'),
  },
});
