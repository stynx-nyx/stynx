import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/flow',
  threshold: 60,
  vitestConfig: './vitest.stryker.config.ts',
  mutate: [
    'src/adapters.ts',
    'src/flow-design.service.ts',
    'src/flow-forms.service.ts',
    'src/flow-runtime.service.ts',
    'src/row-utils.ts',
    'src/validation.ts',
  ],
});
