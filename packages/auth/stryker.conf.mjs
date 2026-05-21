import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/auth',
  vitestConfig: './vitest.stryker.config.ts',
  // Controllers excluded per workspace policy (see tools/stryker/base.mjs).
  // Route paths and permission strings are exercised by reference-api
  // supertest integration tests, not by unit mocks.
  mutate: [
    'src/auth.service.ts',
    'src/cognito-jwt.validator.ts',
    'src/permission-cache.ts',
    'src/permission-query.service.ts',
    'src/stynx-auth.guard.ts',
    'src/stynx-jwt.validator.ts',
    'src/utils.ts',
  ],
});
