import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/idempotency',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/idempotency.interceptor.ts',
    'src/metrics.ts',
  ],
});
