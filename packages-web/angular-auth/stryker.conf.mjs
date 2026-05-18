import { createStrykerConfig } from '../../tools/stryker/base.mjs';

export default createStrykerConfig({
  packageName: '@stynx-web/angular-auth',
  threshold: 60,
  mutate: [
    'src/auth.guard.ts',
    'src/has-permission.directive.ts',
    'src/http-auth.backend.ts',
    'src/jwt.ts',
    'src/login-redirect.component.ts',
    'src/logout-button.component.ts',
    'src/oidc-client.adapter.ts',
    'src/permission.guard.ts',
    'src/session.service.ts',
    'src/storage.ts',
  ],
});
