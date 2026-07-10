import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/angular-tenancy',
  mutate: [
    'src/provide-tenancy.ts',
    'src/tenant-context.service.ts',
    'src/tenant-switcher.component.ts',
    'src/tenant.interceptor.ts',
  ],
});
