import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-trash',
  threshold: 60,
  mutate: [
    'src/trash-list.component.ts',
  ],
});
