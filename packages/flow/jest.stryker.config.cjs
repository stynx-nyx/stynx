const { resolve } = require('node:path');

module.exports = {
  rootDir: resolve(__dirname),
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts', '<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.json') }],
  },
  moduleNameMapper: {
    '^@stynx/auth$': '<rootDir>/../auth/src/index.ts',
    '^@stynx/backend$': '<rootDir>/../backend/src/index.ts',
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  maxWorkers: 1,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
