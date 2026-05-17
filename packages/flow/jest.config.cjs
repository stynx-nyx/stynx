module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/unit/**/*.spec.ts'],
  passWithNoTests: true,
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@stynx/auth$': '<rootDir>/../auth/src/index.ts',
    '^@stynx/backend$': '<rootDir>/../backend/src/index.ts',
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
