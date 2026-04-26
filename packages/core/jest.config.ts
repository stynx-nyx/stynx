import type { Config } from 'jest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';

const require = createRequire(import.meta.url);
const { strictCoverageThreshold } = require('../../jest.coverage.cjs');

const config: Config = {
  rootDir: resolve(__dirname),
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.json') }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  coverageThreshold: strictCoverageThreshold,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};

export default config;
