import { resolve } from 'node:path';
import { createVitestConfig } from '../../tools/repo-config/vitest.base.mjs';

export default createVitestConfig({
  packageDir: __dirname,
  packageName: '@stynx-nyx/angular-audit',
  include: ['test/**/*.spec.ts'],
  environment: 'jsdom',
  passWithNoTests: true,
  alias: {
    '@stynx-nyx/sdk': resolve(__dirname, '../sdk/src/index.ts'),
    '@stynx-nyx/angular': resolve(__dirname, '../angular/src/index.ts'),
    '@stynx-nyx/angular-auth': resolve(__dirname, '../angular-auth/src/index.ts'),
    '@stynx-nyx/angular-i18n': resolve(__dirname, '../angular-i18n/src/index.ts'),
    '@stynx-nyx/angular-tenancy': resolve(__dirname, '../angular-tenancy/src/index.ts'),
    '@stynx-nyx/angular-ui': resolve(__dirname, '../angular-ui/src/index.ts'),
    '@stynx-nyx/angular-audit': resolve(__dirname, 'src/index.ts'),
    rxjs: resolve(__dirname, 'node_modules/rxjs/dist/cjs/index.js'),
    'rxjs/operators': resolve(__dirname, 'node_modules/rxjs/dist/cjs/operators/index.js'),
  },
});
