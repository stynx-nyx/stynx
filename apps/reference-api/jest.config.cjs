module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  moduleNameMapper: {
    '^@stynx/(.+)$': '<rootDir>/../../packages/$1/src/index.ts',
    '^@stech/stynx-backend$': '<rootDir>/../../packages/stynx-backend/src/index.ts',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
};
