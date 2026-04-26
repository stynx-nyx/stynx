import type { Config } from 'jest';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { baseCoverageThreshold } = require('../../jest.coverage.cjs');

const config: Config = {
  rootDir: resolve(__dirname, '..', '..'),
  preset: 'jest-preset-angular',
  setupFilesAfterEnv: ['<rootDir>/test/frontend/setup-jest.ts'],
  testMatch: ['**/test/frontend/**/*.spec.ts'],
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/frontend/src/app/core/$1',
    '^@shared/(.*)$': '<rootDir>/frontend/src/app/shared/$1',
    '^@admin/(.*)$': '<rootDir>/frontend/src/app/admin/$1',
    '^@storage/(.*)$': '<rootDir>/frontend/src/app/storage/$1',
    '^@env/(.*)$': '<rootDir>/frontend/src/environments/$1',
  },
  transform: {
    '^.+\\.(ts|mjs|js|html)$': ['ts-jest', { tsconfig: resolve(__dirname, '../../frontend/tsconfig.spec.json') }],
  },
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/frontend/tsconfig.spec.json',
      stringifyContentPathRegex: '\\.(html|svg)$',
    },
  },
  testEnvironment: 'jsdom',
  coverageThreshold: baseCoverageThreshold,
};

export default config;
