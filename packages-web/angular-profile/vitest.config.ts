import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-web/angular-profile',
  include: ['test/**/*.spec.ts'],
  environment: 'jsdom',
  alias: {
    '@stynx-web/angular-i18n': resolve(__dirname, '../angular-i18n/src/index.ts'),
    '@stynx-web/angular-profile': resolve(__dirname, 'src/index.ts'),
    rxjs: resolve(__dirname, 'node_modules/rxjs/dist/cjs/index.js'),
    'rxjs/operators': resolve(__dirname, 'node_modules/rxjs/dist/cjs/operators/index.js'),
  },
});
