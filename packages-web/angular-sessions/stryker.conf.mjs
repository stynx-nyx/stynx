import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-sessions',
  threshold: 60,
  mutate: [
    'src/active-sessions.component.ts',
  ],
});
