const { strictCoverageThreshold } = require('../../jest.coverage.cjs');

module.exports = {
  rootDir: __dirname,
  testMatch: ['<rootDir>/test/**/*.spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js'],
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@stynx/audit$': '<rootDir>/../audit/src/index.ts',
    '^@stynx/auth$': '<rootDir>/../auth/src/index.ts',
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
    '^@stynx/sessions$': '<rootDir>/../sessions/src/index.ts',
    '^@stynx/storage$': '<rootDir>/../storage/src/index.ts',
    '^@stynx/testing$': '<rootDir>/src/index.ts'
  },
  coverageThreshold: strictCoverageThreshold
};
