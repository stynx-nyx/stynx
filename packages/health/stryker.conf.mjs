import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/health',
  // Controllers excluded per workspace policy (see tools/stryker/base.mjs).
  mutate: [
    'src/health.service.ts',
    'src/info.guard.ts',
    'src/metrics.service.ts',
  ],
});
