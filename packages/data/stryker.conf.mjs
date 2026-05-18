import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/data',
  threshold: 85,
  concurrency: 6,
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/database.ts',
    'src/query-helpers.ts',
    'src/transaction.ts',
  ],
  timeoutMS: 1000,
});
