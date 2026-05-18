import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-tenancy',
  threshold: 60,
  mutate: [
    'src/provide-tenancy.ts',
    'src/tenant-context.service.ts',
    'src/tenant-switcher.component.ts',
    'src/tenant.interceptor.ts',
  ],
});
