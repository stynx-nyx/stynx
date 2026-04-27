module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.spec.ts'],
  moduleNameMapper: {
    '^@stynx-web/sdk$': '<rootDir>/src/index.ts',
  },
  coverageThreshold: {
    global: {
      statements: 85,
      lines: 85,
    },
  },
};
