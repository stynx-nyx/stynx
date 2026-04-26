module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@stynx/auth$': '<rootDir>/test/support/auth-stub.ts',
    '^@stynx/core$': '<rootDir>/../core/src/index.ts',
    '^@stynx/data$': '<rootDir>/../data/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};
