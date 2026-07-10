import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/angular-trash',
  mutate: [
    'src/trash-list.component.ts',
  ],
});
