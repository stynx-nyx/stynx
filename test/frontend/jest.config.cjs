const { resolve } = require('node:path');
const {
  createCjsPreset,
} = require('../../frontend/node_modules/jest-preset-angular/build/presets');

const angularPreset = createCjsPreset({
  tsconfig: resolve(__dirname, 'tsconfig.jest.json'),
  stringifyContentPathRegex: '\\.(html|svg)$',
});

module.exports = {
  ...angularPreset,
  rootDir: resolve(__dirname, '..', '..'),
  setupFilesAfterEnv: ['<rootDir>/test/frontend/setup-jest.ts'],
  testMatch: ['**/test/frontend/**/*.spec.ts'],
  moduleDirectories: ['node_modules', resolve(__dirname, '../../frontend/node_modules')],
  modulePaths: ['<rootDir>/frontend/node_modules'],
  moduleNameMapper: {
    ...angularPreset.moduleNameMapper,
    '^@core/(.*)$': '<rootDir>/frontend/src/app/core/$1',
    '^@shared/(.*)$': '<rootDir>/frontend/src/app/shared/$1',
    '^@admin/(.*)$': '<rootDir>/frontend/src/app/admin/$1',
    '^@storage/(.*)$': '<rootDir>/frontend/src/app/storage/$1',
    '^@env/(.*)$': '<rootDir>/frontend/src/environments/$1',
  },
  coverageThreshold: {
    global: {
      statements: 55,
      branches: 30,
      functions: 20,
      lines: 55,
    },
  },
};
