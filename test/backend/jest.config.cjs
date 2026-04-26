const { resolve } = require('node:path');
const { baseCoverageThreshold } = require('../../jest.coverage.cjs');

const config = {
  rootDir: resolve(__dirname),
  testMatch: ['**/unit/**/*.(spec|test).ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        tsconfig: resolve(__dirname, './tsconfig.test.json'),
      },
    ],
  },
  moduleNameMapper: {
    '^@nestjs/(.*)$': '<rootDir>/node_modules/@nestjs/$1',
    '^@config/(.*)$': '<rootDir>/../../backend/src/config/$1',
    '^@core/(.*)$': '<rootDir>/../../backend/src/core/$1',
    '^@modules/(.*)$': '<rootDir>/../../backend/src/modules/$1',
    '^@shared/(.*)$': '<rootDir>/../../backend/src/shared/$1',
    '^@stynx/data$': '<rootDir>/support/data-stub.ts',
    '^jose$': '<rootDir>/support/jose-stub.ts',
    '^reflect-metadata$': '<rootDir>/node_modules/reflect-metadata',
    '^rxjs$': '<rootDir>/node_modules/rxjs',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  collectCoverageFrom: ['../../backend/src/**/*.ts', '!../../backend/src/main.ts'],
  coverageThreshold: baseCoverageThreshold,
};

module.exports = config;
