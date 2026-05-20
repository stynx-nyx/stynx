import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-iam',
  mutate: [
    'src/effective-permissions.component.ts',
    'src/iam-api.service.ts',
    'src/provide-iam.ts',
    'src/routes.ts',
    'src/users-admin.component.ts',
  ],
  incremental: false,
});
