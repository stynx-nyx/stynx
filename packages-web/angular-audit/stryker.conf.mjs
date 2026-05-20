import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-audit',
  mutate: [
    'src/audit-api.service.ts',
    'src/provide-audit.ts',
    'src/routes.ts',
  ],
  incremental: false,
});
