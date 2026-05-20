# @stynx-web/angular-auth

Angular 20 authentication integration for STYNX. It combines `angular-auth-oidc-client`, STYNX session exchange, access-token storage, permission guards, hosted-auth action handoff support, and permission-aware UI directives.

## Install

```bash
pnpm add @stynx-web/angular-auth
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`
- `@angular/router ^20.2.0`

## Use

```ts
import { provideStynxDefaults } from '@stynx-web/angular';
import { provideStynxAuth, stynxAuthGuard, stynxPermissionGuard } from '@stynx-web/angular-auth';

bootstrapApplication(AppComponent, {
  providers: [
    provideStynxDefaults({
      auth: provideStynxAuth({
        oidc: authOptions,
        loginRedirectRoute: '/login',
        permissionDeniedPath: '/forbidden',
      }),
    }),
  ],
});

export const routes = [
  { path: 'admin', canActivate: [stynxAuthGuard, stynxPermissionGuard('admin:read')] },
];
```

NgModule hosts can use `StynxAngularAuthModule.forRoot(...)`.

## Public Surface

- Providers/modules: `provideStynxAuth`, `StynxAngularAuthModule`.
- Guards/directives: `stynxAuthGuard`, `stynxPermissionGuard`, `StynxHasPermissionDirective`.
- Components: `StynxLoginRedirectComponent`, `StynxLogoutButtonComponent`, `StynxPermissionDeniedComponent`.
- Services/adapters: `StynxSessionService`, `HttpAuthBackend`, `OidcClientAdapter`.
- Tokens/types: auth backend/OIDC/session tokens, JWT helpers, hosted-auth action types, session bundle/state types.

## See Also

- [`@stynx-web/angular`](../angular/README.md)
- [`@stynx-web/angular-profile`](../angular-profile/README.md)
- [`@stynx-web/angular-sessions`](../angular-sessions/README.md)
- [Reference app auth demo](../../reference/web/README.md#dev-auth-is-test-only)
