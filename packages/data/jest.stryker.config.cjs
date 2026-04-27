const { resolve } = require('node:path');

module.exports = {
  rootDir: resolve(__dirname),
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts', '<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.json') }],
  },
  moduleNameMapper: {
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  maxWorkers: 1,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
