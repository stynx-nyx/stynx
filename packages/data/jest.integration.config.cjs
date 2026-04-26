const { resolve } = require('node:path');
const { strictCoverageThreshold } = require('../../jest.coverage.cjs');

module.exports = {
  rootDir: resolve(__dirname),
  testMatch: ['<rootDir>/test/integration/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.json') }],
  },
  moduleNameMapper: {
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/src/index.ts',
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  coverageThreshold: strictCoverageThreshold,
  collectCoverageFrom: ['<rootDir>/src/**/*.ts'],
};
