import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-profile',
  mutate: [
    'src/preferences-form.component.ts',
    'src/profile-form.component.ts',
  ],
});
