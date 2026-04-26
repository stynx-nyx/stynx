module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
    '^@stynx/privacy$': '<rootDir>/../privacy/src/index.ts',
  },
};
