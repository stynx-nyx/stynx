import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-sessions',
  mutate: [
    'src/active-sessions.component.ts',
  ],
});
