import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/tenancy',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/membership-cache.ts',
    'src/tenant-context.interceptor.ts',
    'src/tenancy.service.ts',
  ],
});
