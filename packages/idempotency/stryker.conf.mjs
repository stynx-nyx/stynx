import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/idempotency',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/idempotency.interceptor.ts',
    'src/metrics.ts',
  ],
});
