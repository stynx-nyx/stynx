import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/audit',
  threshold: 60,
  jestConfig: './jest.stryker.config.cjs',
  mutate: [
    'src/audit.service.ts',
    'src/retention.ts',
    'src/sql-adapter.ts',
  ],
});
