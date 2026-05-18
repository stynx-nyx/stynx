import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/sdk',
  threshold: 60,
  mutate: [
    'src/api-client.ts',
    'src/auth-provider.ts',
    'src/auth.ts',
    'src/authorization.ts',
    'src/client.ts',
    'src/cognito.ts',
    'src/errors.ts',
    'src/http.ts',
    'src/jwt.ts',
    'src/session-manager.ts',
    'src/tenant-provider.ts',
    'src/token-store.ts',
    'src/transport.ts',
  ],
});
