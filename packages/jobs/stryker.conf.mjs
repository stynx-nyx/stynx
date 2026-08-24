import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/jobs',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/backoff.ts',
    'src/cron.ts',
    'src/jobs.registry.ts',
    'src/jobs.repository.ts',
    'src/jobs.scheduler.ts',
    'src/jobs.service.ts',
    'src/jobs.worker.ts',
  ],
});
