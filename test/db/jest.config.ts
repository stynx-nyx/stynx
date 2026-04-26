import type { Config } from 'jest';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { baseCoverageThreshold } = require('../../jest.coverage.cjs');

const config: Config = {
  rootDir: resolve(__dirname),
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.test.json') }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  coverageThreshold: baseCoverageThreshold,
};

export default config;
