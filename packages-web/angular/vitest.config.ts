import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-web/angular',
  include: ['test/**/*.spec.ts'],
  environment: 'jsdom',
  alias: {
    '@stynx-web/sdk': resolve(__dirname, '../sdk/src/index.ts'),
    '@stynx-web/angular': resolve(__dirname, 'src/index.ts'),
    '@stynx-web/angular-tenancy': resolve(__dirname, '../angular-tenancy/src/index.ts'),
    rxjs: resolve(__dirname, 'node_modules/rxjs/dist/cjs/index.js'),
    'rxjs/operators': resolve(__dirname, 'node_modules/rxjs/dist/cjs/operators/index.js'),
  },
});
