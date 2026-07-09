import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/flow',
  concurrency: 1,
  vitestConfig: './vitest.stryker.config.ts',
  ignoreStatic: true,
  mutate: [
    'src/adapters.ts',
    'src/flow-design.service.ts',
    'src/flow-forms.service.ts',
    'src/flow-runtime.service.ts',
    'src/internal/design/**/*.ts',
    'src/internal/forms/**/*.ts',
    'src/internal/runtime/**/*.ts',
    'src/row-utils.ts',
    'src/validation.ts',
  ],
});
