import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-i18n',
  mutate: [
    'src/i18n.service.ts',
    'src/intl.pipes.ts',
    'src/locale-switcher.component.ts',
    'src/translate.pipe.ts',
  ],
});
