import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/ratelimit',
  threshold: 60,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/metrics.ts',
    'src/rate-limit-policy.service.ts',
    'src/rate-limit.guard.ts',
  ],
});
