const { resolve } = require('node:path');
const { baseCoverageThreshold } = require('../../jest.coverage.cjs');

const angularPreset = resolve(
  __dirname,
  '../../frontend/node_modules/jest-preset-angular/presets/defaults-esm',
);

module.exports = {
  rootDir: resolve(__dirname, '..', '..'),
  preset: angularPreset,
  setupFilesAfterEnv: ['<rootDir>/test/frontend/setup-jest.ts'],
  testMatch: ['**/test/frontend/**/*.spec.ts'],
  moduleDirectories: ['node_modules', resolve(__dirname, '../../frontend/node_modules')],
  modulePaths: ['<rootDir>/frontend/node_modules'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/frontend/src/app/core/$1',
    '^@shared/(.*)$': '<rootDir>/frontend/src/app/shared/$1',
    '^@admin/(.*)$': '<rootDir>/frontend/src/app/admin/$1',
    '^@storage/(.*)$': '<rootDir>/frontend/src/app/storage/$1',
    '^@env/(.*)$': '<rootDir>/frontend/src/environments/$1',
  },
  snapshotSerializers: [
    resolve(__dirname, '../../frontend/node_modules/jest-preset-angular/build/serializers/html-comment.js'),
    resolve(__dirname, '../../frontend/node_modules/jest-preset-angular/build/serializers/ng-snapshot.js'),
    resolve(__dirname, '../../frontend/node_modules/jest-preset-angular/build/serializers/no-ng-attributes.js'),
  ],
  transform: {
    '^.+\\.(ts|mjs|js|html)$': [
      resolve(__dirname, '../../frontend/node_modules/ts-jest'),
      { tsconfig: resolve(__dirname, 'tsconfig.jest.json') },
    ],
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/test/frontend/tsconfig.jest.json',
      stringifyContentPathRegex: '\\.(html|svg)$',
    },
  },
  testEnvironment: 'jsdom',
  coverageThreshold: baseCoverageThreshold,
};
