import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-i18n',
  threshold: 60,
  mutate: [
    'src/i18n.service.ts',
    'src/locale-switcher.component.ts',
    'src/translate.pipe.ts',
  ],
});
