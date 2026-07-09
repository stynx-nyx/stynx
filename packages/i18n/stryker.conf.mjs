import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/i18n',
  concurrency: 1,
  vitestConfig: './vitest.stryker.config.ts',
  // Controllers excluded per workspace policy (see tools/stryker/base.mjs).
  mutate: [
    'src/catalog.service.ts',
    'src/error-translator.service.ts',
    'src/i18n-admin.service.ts',
    'src/locale.interceptor.ts',
    'src/locale.service.ts',
    'src/localized-error.filter.ts',
  ],
});
