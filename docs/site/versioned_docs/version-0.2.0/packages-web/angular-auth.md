---
title: '@stynx-nyx/angular-auth'
---

# @stynx-nyx/angular-auth

Angular 20 authentication integration for STYNX. It combines `angular-auth-oidc-client`, STYNX session exchange, access-token storage, permission guards, hosted-auth action handoff support, and permission-aware UI directives.

## Install

```bash
pnpm add @stynx-nyx/angular-auth
```

## Peer Dependencies

- `@angular/common ^20.2.0`
- `@angular/core ^20.2.0`
- `@angular/forms ^20.2.0`
- `@angular/router ^20.2.0`

## Use

```ts
import { provideStynxDefaults } from '@stynx-nyx/angular';
import { provideStynxAuth, stynxAuthGuard, stynxPermissionGuard } from '@stynx-nyx/angular-auth';

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

- [`@stynx-nyx/angular`](/docs/packages-web/angular)
- [`@stynx-nyx/angular-profile`](/docs/packages-web/angular-profile)
- [`@stynx-nyx/angular-sessions`](/docs/packages-web/angular-sessions)
- [Reference app auth demo](/docs/reference/web#dev-auth-is-test-only)
