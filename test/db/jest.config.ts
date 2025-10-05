import type { Config } from 'jest';
import { resolve } from 'node:path';

const config: Config = {
  rootDir: resolve(__dirname, '..', '..'),
  testMatch: ['**/test/db/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, '../../tsconfig.json') }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
};

export default config;
