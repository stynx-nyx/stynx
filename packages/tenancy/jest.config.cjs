const { resolve } = require('node:path');

const strictCoverageThreshold = {
  global: {
    statements: 95,
    branches: 95,
    functions: 95,
    lines: 95,
  },
};

module.exports = {
  rootDir: resolve(__dirname),
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.json') }],
  },
  moduleNameMapper: {
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
    '^@stynx/idempotency$': '<rootDir>/../idempotency/src/index.ts',
    '^@stynx/tenancy$': '<rootDir>/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  coverageThreshold: strictCoverageThreshold,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
