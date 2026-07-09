import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-nyx/contracts',
  mutate: [
    'src/audit.ts',
    'src/auth.ts',
    'src/authorization.ts',
    'src/db-context.ts',
    'src/errors.ts',
    'src/identity-admin.ts',
    'src/storage.ts',
    'src/tenancy.ts',
  ],
});
