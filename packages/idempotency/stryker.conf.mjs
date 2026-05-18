import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/idempotency',
  threshold: 60,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/idempotency.interceptor.ts',
    'src/metrics.ts',
  ],
});
