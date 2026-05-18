import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-profile',
  threshold: 60,
  mutate: [
    'src/preferences-form.component.ts',
    'src/profile-form.component.ts',
  ],
});
