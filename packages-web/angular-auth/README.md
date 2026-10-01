# `@stynx-nyx/angular-auth`

Angular authentication composition, route guards, session state, and permission-aware UI.

## Setup

```ts
import { provideStynxAuth } from '@stynx-nyx/angular-auth';

export const appConfig = {
  providers: [
    provideStynxAuth({
      oidc: {
        authority: env.authUrl,
        clientId: env.clientId,
        redirectUrl: `${location.origin}/login/callback`,
        postLogoutRedirectUri: location.origin,
        scope: 'openid profile email',
        responseType: 'code',
        silentRenew: true,
        useRefreshToken: true,
      },
    }),
  ],
};
```

`StynxAngularAuthModule.forRoot(options)` supplies the NgModule equivalent.
The session service is `StynxSessionService`.

## Authorization UI

```ts
import { stynxAuthGuard, stynxPermissionGuard } from '@stynx-nyx/angular-auth';

export const routes = [
  {
    path: 'admin',
    canActivate: [stynxAuthGuard, stynxPermissionGuard('admin:access')],
    component: AdminPage,
  },
];
```

```html
<button *stynxHasPermission="'orders:delete'" (click)="delete()">Delete</button>
```

`StynxSessionService.hasAllPermissions()` and `hasAnyPermissions()` use the
same matching rule as the route guard and `*stynxHasPermission`: comparison is
case insensitive; a granted `*` covers any concrete permission, and a final
segment wildcard such as `ops:*` covers `ops:read` and `ops:case:read`. It does
not cover `ops` or `ops2:read`. Required-side wildcards are literal. Empty
`hasAllPermissions([])` is true; empty `hasAnyPermissions([])` is false.

The directive only controls display. Backend authorization must enforce access
for every protected operation.

## Session state

`StynxSessionService.state` and `active` are Angular signals. The service
provides `login()`, `completeLogin()`, `logout()`, `refresh()`, and
`switchTenant()`. Its `snapshot()` returns the current session state, including
permissions and exchanged token claims.

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/angular`: `workspace:*`
- `@stynx-nyx/angular-i18n`: `workspace:*`
- `@stynx-nyx/sdk`: `workspace:*`
- `angular-auth-oidc-client`: `^21.0.1`
- `rxjs`: `^7.8.2`

### Optional dependencies

_None._

### Peer dependencies

- `@angular/common`: `>=22.0.0 <23`
- `@angular/core`: `>=22.0.0 <23`
- `@angular/forms`: `>=22.0.0 <23`
- `@angular/router`: `>=22.0.0 <23`

### Development-only dependencies

- `@angular/common`: `22.2.1`
- `@angular/compiler`: `22.2.1`
- `@angular/compiler-cli`: `22.2.1`
- `@angular/core`: `22.2.1`
- `@angular/forms`: `22.2.1`
- `@angular/platform-browser`: `22.2.1`
- `@angular/router`: `22.2.1`
- `@types/node`: `24.13.4`
- `jsdom`: `^29.0.2`
- `ng-packagr`: `22.1.1`
- `tslib`: `^2.8.1`
- `typescript`: `6.0.3`

<!-- stynx:generated-dependencies:end -->
