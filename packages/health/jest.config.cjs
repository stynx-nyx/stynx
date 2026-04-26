const { resolve } = require('node:path');
const { strictCoverageThreshold } = require('../../jest.coverage.cjs');

module.exports = {
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
