import type { Config } from 'jest';
import { resolve } from 'node:path';

const config: Config = {
  rootDir: resolve(__dirname, '..', '..'),
  testMatch: ['**/test/backend/**/*.(spec|test).ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: resolve(__dirname, '../../backend/tsconfig.json'),
      },
    ],
  },
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/backend/src/core/$1',
    '^@shared/(.*)$': '<rootDir>/backend/src/shared/$1',
    '^@config/(.*)$': '<rootDir>/backend/src/config/$1',
    '^@modules/(.*)$': '<rootDir>/backend/src/modules/$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  collectCoverageFrom: ['backend/src/**/*.ts', '!backend/src/main.ts'],
};

export default config;
