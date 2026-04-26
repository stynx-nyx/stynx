const { resolve } = require('node:path');
const { baseCoverageThreshold } = require('../../jest.coverage.cjs');

const config = {
  rootDir: resolve(__dirname),
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: resolve(__dirname, './tsconfig.test.json') }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  coverageThreshold: baseCoverageThreshold,
};

module.exports = config;
