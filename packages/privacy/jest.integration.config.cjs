module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
    '^@stynx/privacy$': '<rootDir>/src/index.ts',
    '^@stynx/sessions$': '<rootDir>/../sessions/src/index.ts',
    '^@stynx/testing$': '<rootDir>/../testing/src/index.ts',
  },
};
