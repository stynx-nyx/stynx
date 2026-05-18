import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/health',
  threshold: 60,
  mutate: [
    'src/health.controller.ts',
    'src/health.service.ts',
    'src/info.guard.ts',
    'src/metrics.service.ts',
  ],
});
