const { resolve } = require('node:path');
const { createEsmPreset } = require('jest-preset-angular/presets');

const preset = createEsmPreset({
  tsconfig: resolve(__dirname, './tsconfig.spec.json'),
});

module.exports = {
  ...preset,
  rootDir: resolve(__dirname),
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  passWithNoTests: true,
  moduleNameMapper: {
    ...preset.moduleNameMapper,
    '^@stynx-web/angular-auth$': '<rootDir>/../angular-auth/src/index.ts',
    '^@stynx-web/angular-ui$': '<rootDir>/../angular-ui/src/index.ts',
    '^@stynx-web/angular-flow$': '<rootDir>/src/index.ts',
    '^@stynx-web/sdk$': '<rootDir>/../sdk/src/index.ts',
    '^rxjs$': '<rootDir>/node_modules/rxjs/dist/cjs/index.js',
    '^rxjs/operators$': '<rootDir>/node_modules/rxjs/dist/cjs/operators/index.js'
  }
};
