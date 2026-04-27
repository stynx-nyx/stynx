module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
    '^@stynx/testing$': '<rootDir>/../testing/src/index.ts',
    '^@stynx/privacy$': '<rootDir>/src/index.ts',
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/tokens.ts'],
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/src/errors.ts',
    '/src/pii-map.service.ts',
    '/src/privacy.controller.ts',
    '/src/privacy.module.ts',
    '/src/privacy-object-store.service.ts',
    '/src/ropa.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85,
    },
  },
};
