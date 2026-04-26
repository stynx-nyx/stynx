import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/data',
  threshold: 85,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/database.ts',
    'src/query-helpers.ts',
    'src/transaction.ts',
  ],
});
