import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/tenancy',
  threshold: 80,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/membership-cache.ts',
    'src/tenant-context.interceptor.ts',
    'src/tenancy.service.ts',
  ],
});
