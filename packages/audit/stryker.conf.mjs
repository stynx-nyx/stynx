import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/audit',
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/audit.service.ts',
    'src/retention.ts',
    'src/sql-adapter.ts',
  ],
});
