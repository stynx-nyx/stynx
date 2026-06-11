import { resolve } from 'node:path';
import { createVitestConfig } from '../../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-domain/demo-bookmark-web',
  include: ['test/**/*.spec.ts'],
  environment: 'jsdom',
  alias: {
    '@stynx-web/angular': resolve(__dirname, '../../../packages-web/angular/src/index.ts'),
    '@stynx-web/angular-tenancy': resolve(__dirname, '../../../packages-web/angular-tenancy/src/index.ts'),
    rxjs: resolve(__dirname, 'node_modules/rxjs/dist/cjs/index.js'),
    'rxjs/operators': resolve(__dirname, 'node_modules/rxjs/dist/cjs/operators/index.js'),
  },
});
