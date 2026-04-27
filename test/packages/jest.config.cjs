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
  moduleNameMapper: {
    '^@nestjs/common$': resolve(__dirname, './node_modules/@nestjs/common'),
    '^@nestjs/core$': resolve(__dirname, './node_modules/@nestjs/core'),
    '^@stynx/auth$': resolve(__dirname, './support/auth-stub.ts'),
    '^@stynx/audit$': resolve(__dirname, '../../packages/audit/src/index.ts'),
    '^@stynx/core$': resolve(__dirname, '../../packages/core/src/index.ts'),
    '^@stynx/data$': resolve(__dirname, './support/data-stub.ts'),
    '^@stynx/health$': resolve(__dirname, '../../packages/health/src/index.ts'),
    '^@stynx/idempotency$': resolve(__dirname, '../../packages/idempotency/src/index.ts'),
    '^@stynx/logging$': resolve(__dirname, '../../packages/logging/src/index.ts'),
    '^@stynx/ratelimit$': resolve(__dirname, '../../packages/ratelimit/src/index.ts'),
    '^@stynx/sessions$': resolve(__dirname, '../../packages/sessions/src/index.ts'),
    '^@stynx/storage$': resolve(__dirname, '../../packages/storage/src/index.ts'),
    '^@stech/contracts$': resolve(__dirname, '../../packages/contracts/src/index.ts'),
    '^@stech/stynx-frontend-contracts$': resolve(
      __dirname,
      '../../packages/stynx-frontend-contracts/src/index.ts',
    ),
    '^@stech/stynx-frontend-client$': resolve(
      __dirname,
      '../../packages/stynx-frontend-client/src/index.ts',
    ),
  },
  coverageThreshold: baseCoverageThreshold,
};

module.exports = config;
