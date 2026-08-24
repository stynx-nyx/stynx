import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/worklist',
  concurrency: 1,
  vitestConfig: './vitest.stryker.config.ts',
  ignoreStatic: true,
  mutate: [
    'src/deadline.ts',
    'src/errors.ts',
    'src/ports.ts',
    'src/row-utils.ts',
    'src/sql-errors.ts',
    'src/strategies.ts',
    'src/validation.ts',
    'src/worklist-items.service.ts',
    'src/worklist-queues.service.ts',
    'src/worklist-sla.service.ts',
  ],
});
