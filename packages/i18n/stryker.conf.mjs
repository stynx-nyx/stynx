import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx/i18n',
  mutate: [
    'src/catalog.service.ts',
    'src/error-translator.service.ts',
    'src/i18n-admin.service.ts',
    'src/i18n.controller.ts',
    'src/locale.interceptor.ts',
    'src/locale.service.ts',
    'src/localized-error.filter.ts',
  ],
});
