import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/auth',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/auth.controller.ts',
    'src/auth.service.ts',
    'src/cognito-jwt.validator.ts',
    'src/permission-cache.ts',
    'src/permission-query.service.ts',
    'src/stynx-auth.guard.ts',
    'src/stynx-jwt.validator.ts',
    'src/utils.ts',
  ],
});
