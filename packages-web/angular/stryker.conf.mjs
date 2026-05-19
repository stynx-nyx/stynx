import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular',
  mutate: [
    'src/auth.interceptor.ts',
    'src/empty-state.component.ts',
    'src/error-banner.service.ts',
    'src/error.interceptor.ts',
    'src/request-id.interceptor.ts',
    'src/request-id.ts',
    'src/tenant-context.service.ts',
    'src/tenant.interceptor.ts',
    'src/toast.service.ts',
  ],
});
