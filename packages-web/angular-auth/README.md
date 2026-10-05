# `@stynx-nyx/angular-auth` — Angular OIDC login, STYNX session state, route guards and permission-aware UI

`@stynx-nyx/angular-auth` provides Angular authentication composition, route guards, session state, and permission-aware UI. It wraps `angular-auth-oidc-client` for the identity-provider login, exchanges the provider token for a STYNX session through the backend's session endpoints, keeps the session in a signal-based `StynxSessionService`, and offers guards, a structural directive and three small components that read that state.

## Purpose

A STYNX frontend authenticates in two steps: an OIDC login against the identity provider, then an exchange of the provider access token for a tenant-scoped STYNX session that carries the user's permissions. This package performs both steps, registers the resulting session as the `AuthProvider` that [`@stynx-nyx/angular`](/docs/packages-web/angular/) uses for HTTP calls, and exposes the permission list to routes and templates.

You reach for it right after `@stynx-nyx/angular`, in any application that has a login.

What it does NOT do: it does not enforce authorization (guards and the directive only control navigation and display; the backend must enforce access for every protected operation), it does not render a login form (the identity provider hosts it), and it does not verify token signatures (`parseJwtPayload` only decodes the payload).

## Audience

Angular frontend developers wiring login, logout, tenant switching and permission-gated routes or controls in a STYNX-backed application.

## Install

```bash
pnpm add @stynx-nyx/angular-auth
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

## Quick start

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

`StynxAngularAuthModule.forRoot(options)` supplies the NgModule equivalent. The session service is `StynxSessionService`.

Protect routes and mount the callback component on the OIDC redirect route:

```ts
import {
  StynxLoginRedirectComponent,
  stynxAuthGuard,
  stynxPermissionGuard,
} from '@stynx-nyx/angular-auth';

export const routes = [
  { path: 'login/callback', component: StynxLoginRedirectComponent },
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

## Public API surface

### Providers and modules

| Export                   | Signature                                          | Description                                                                                                                                                                |
| ------------------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `provideStynxAuth`       | `(options: StynxAngularAuthModuleOptions)`         | Registers the OIDC client, `OidcClientAdapter`, `HttpAuthBackend`, `StynxSessionService` (also as `STYNX_AUTH_PROVIDER`) and a route for `StynxPermissionDeniedComponent`. |
| `StynxAngularAuthModule` | `.forRoot(options: StynxAngularAuthModuleOptions)` | NgModule equivalent. Registers the same providers except the permission-denied route, and exports the directive and the three components.                                  |

### Services

| Export                | Description                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `StynxSessionService` | Session state and operations; implements the `AuthProvider` interface of [`@stynx-nyx/sdk`](/docs/packages-web/sdk/).                                  |
| `HttpAuthBackend`     | Default `StynxAuthBackend`. Posts to `/sessions`, `/sessions/switch` and `/sessions/logout` under the `apiBaseUrl` configured in `@stynx-nyx/angular`. |
| `OidcClientAdapter`   | Default `StynxOidcAdapter` over `OidcSecurityService`; also resolves hosted-action links (`getHostedActionLink`, `openHostedAction`).                  |
| `RefreshTokenStorage` | Reads, writes and clears the refresh token in `sessionStorage` or a cookie.                                                                            |

`StynxSessionService` members:

| Member                                                       | Description                                                                                                                  |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `state`, `active`                                            | Angular signals: the `StynxSessionState` and its `active` flag.                                                              |
| `active$`                                                    | Deprecated observable of the state; use the signal or `toObservable(state)`.                                                 |
| `login()`, `loginRedirect()`                                 | Start the OIDC authorization redirect.                                                                                       |
| `completeLogin(url?)`                                        | Finishes the OIDC callback, resolves the tenant, exchanges the provider token for a STYNX session and returns the new state. |
| `logout()`                                                   | Calls the backend logout (errors ignored), clears state and logs off the OIDC client.                                        |
| `refresh()`                                                  | Forces an OIDC session refresh and re-exchanges for the current tenant; returns the new access token or `null`.              |
| `switchTenant(tenantId)`                                     | Exchanges the current session for one in another tenant; throws when there is no active access token.                        |
| `getAccessToken()`, `onAuthFailure()`                        | `AuthProvider` members: the current access token, and a state reset on authentication failure.                               |
| `hasAllPermissions(required)`, `hasAnyPermissions(required)` | Permission checks, described below.                                                                                          |
| `snapshot()`                                                 | Returns the current session state, including permissions and exchanged token claims.                                         |

### Guards

| Export                 | Signature                                   | Description                                                                                                         |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `stynxAuthGuard`       | `CanActivateFn`                             | Allows navigation when the session is active; otherwise redirects to `loginRedirectRoute`.                          |
| `stynxPermissionGuard` | `(...permissions: string[]): CanActivateFn` | Allows navigation when the session holds all listed permissions; otherwise redirects to the permission-denied path. |

### Components and directives

| Selector / usage            | Class                            | Description                                                                                       |
| --------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------- |
| `*stynxHasPermission`       | `StynxHasPermissionDirective`    | Renders its template only while the session holds the permission, or all permissions of an array. |
| `<stynx-login-redirect>`    | `StynxLoginRedirectComponent`    | On init calls `completeLogin()` with the current window URL. Mount it on the OIDC redirect route. |
| `<stynx-logout-button>`     | `StynxLogoutButtonComponent`     | Button that calls `logout()`.                                                                     |
| `<stynx-permission-denied>` | `StynxPermissionDeniedComponent` | Alert page with a "log in again" action that calls `loginRedirect()`.                             |

The components are standalone and translate their text with `StynxTranslatePipe` from `@stynx-nyx/angular-i18n`. The message catalogs are published as `@stynx-nyx/angular-auth/catalogs/en.json` and `@stynx-nyx/angular-auth/catalogs/pt-BR.json`.

### Functions

| Export                 | Signature                                          | Description                                                                                    |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `permissionMatches`    | `(granted: string, required: string): boolean`     | The matching rule shared by the service, the guard and the directive.                          |
| `permissionDeniedPath` | `(options: StynxAngularAuthModuleOptions): string` | Resolves `permissionDeniedPath`, then `unauthorizedRoute`, then `'/forbidden'`.                |
| `parseJwtPayload`      | `(token: string): Record<string, unknown> \| null` | Decodes a JWT payload without verifying it; `null` when it cannot be decoded.                  |
| `normalizePermissions` | `(payload): string[]`                              | Reads `permissions`, else `scope`, from a payload as a string array or space-separated string. |

### Tokens

| Export                        | Description                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `STYNX_ANGULAR_AUTH_OPTIONS`  | The `StynxAngularAuthModuleOptions` value.                                         |
| `STYNX_OIDC_ADAPTER`          | The `StynxOidcAdapter` in use; override to replace the OIDC client.                |
| `STYNX_AUTH_BACKEND`          | The `StynxAuthBackend` in use; override to replace the session-exchange transport. |
| `STYNX_SESSION_AUTH_PROVIDER` | `AuthProvider` token. In this package only the testing entry point provides it.    |

### Types

| Export                                                                                                                                                  | Description                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `StynxAngularAuthModuleOptions`                                                                                                                         | Options of `provideStynxAuth` and `forRoot`.                                         |
| `StynxSessionState`                                                                                                                                     | `active`, `accessToken`, `refreshToken`, `sid`, `permissions`, `tenantId`, `claims`. |
| `StynxSessionBundle`                                                                                                                                    | Session-exchange response: tokens, `sid`, expiry timestamps, optional `permissions`. |
| `StynxAuthBackend`, `StynxOidcAdapter`                                                                                                                  | Ports behind `STYNX_AUTH_BACKEND` and `STYNX_OIDC_ADAPTER`.                          |
| `StynxHostedAuthAction`, `StynxHostedAuthActionContext`, `StynxHostedAuthActionLink`, `StynxHostedAuthActionUrlBuilder`, `StynxHostedAuthActionOptions` | Hosted change-password and MFA-enrolment link types.                                 |
| `StynxRefreshTokenStorageMode`, `RefreshTokenStorageMode`, `CookieOptions`, `SessionStorageLike`                                                        | Refresh-token storage types.                                                         |

### Testing entry point

`@stynx-nyx/angular-auth/testing` exports `createStynxSessionStub(initial?)` and `provideStynxSessionStub(stub?)`, with the `StynxSessionStub` and `StynxSessionStubCalls` types. The stub has the real session-state shape, controllable signals (`setSession`, `setPermissions`, `deactivate`), the same permission matching, and recorded calls for the public auth methods.

## Configuration

### `StynxAngularAuthModuleOptions`

| Option                 | Type                                   | Default                                                            | Description                                                                                      |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `oidc`                 | `OpenIdConfiguration`                  | (required)                                                         | Passed unchanged to `angular-auth-oidc-client`.                                                  |
| `loginRedirectRoute`   | `string`                               | `'/login'`                                                         | Where `stynxAuthGuard` redirects an inactive session.                                            |
| `permissionDeniedPath` | `string`                               | `'/forbidden'`                                                     | Where `stynxPermissionGuard` redirects; `provideStynxAuth` also registers the denied page there. |
| `unauthorizedRoute`    | `string`                               | none                                                               | Deprecated alias used when `permissionDeniedPath` is absent.                                     |
| `hostedActions`        | `StynxHostedAuthActionOptions`         | none                                                               | `changePassword` and `mfaEnrolment` URLs or builder functions, and an optional `returnUrl`.      |
| `sessionStorageKey`    | `string`                               | `'stynx.angular-auth.refresh-token'`                               | Storage key, and the default cookie name.                                                        |
| `refreshTokenStorage`  | `'session-storage' \| 'cookie'`        | `'session-storage'`                                                | Where the refresh token is kept.                                                                 |
| `refreshTokenCookie`   | `{ name?, path?, sameSite?, secure? }` | name = storage key, `path: '/'`, `sameSite: 'Lax'`, `secure: true` | Cookie attributes for the `cookie` mode.                                                         |

Hosted-action URL strings may contain the placeholders `{returnUrl}`, `{state}`, `{tenantId}` and `{locale}`; values are URL-encoded. When no `returnUrl` is given, the current URL is used with the OIDC callback parameters and the fragment removed.

### Permission matching

`StynxSessionService.hasAllPermissions()` and `hasAnyPermissions()` use the same matching rule as the route guard and `*stynxHasPermission`: comparison is case insensitive; a granted `*` covers any concrete permission, and a final segment wildcard such as `ops:*` covers `ops:read` and `ops:case:read`. It does not cover `ops` or `ops2:read`. Required-side wildcards are literal. Empty `hasAllPermissions([])` is true; empty `hasAnyPermissions([])` is false.

The session's permissions come from the `permissions` field of the session-exchange response when present, otherwise from the `permissions` or `scope` claim of the STYNX access token.

## Examples

### Example 1 — NgModule wiring with custom route names

Adapted from the reference web application (`reference/web/src/main.ts`), which uses the module form and still passes the deprecated `unauthorizedRoute` option where this example uses `permissionDeniedPath`:

```ts
importProvidersFrom(
  StynxAngularModule.forRoot({ apiBaseUrl: environment.apiBaseUrl, sessionMode: 'bearer' }),
  StynxAngularAuthModule.forRoot({
    oidc: {
      authority: environment.apiBaseUrl,
      clientId: 'reference-web-dev',
      redirectUrl: `${environment.appBaseUrl}/login`,
      postLogoutRedirectUri: `${environment.appBaseUrl}/login`,
      scope: 'openid profile email',
      responseType: 'code',
    },
    loginRedirectRoute: '/login',
    permissionDeniedPath: '/unauthorized',
  }),
);
```

### Example 2 — reading session state in a component

```ts
import { Component, computed, inject } from '@angular/core';
import { StynxLogoutButtonComponent, StynxSessionService } from '@stynx-nyx/angular-auth';

@Component({
  standalone: true,
  imports: [StynxLogoutButtonComponent],
  template: `
    @if (session.active()) {
      <span>{{ tenant() }}</span>
      <stynx-logout-button />
    }
  `,
})
export class AccountMenuComponent {
  readonly session = inject(StynxSessionService);
  readonly tenant = computed(() => this.session.state().tenantId);
  readonly canExport = computed(
    () =>
      this.session.active() && this.session.hasAnyPermissions(['reports:export', 'reports:admin']),
  );
}
```

### Example 3 — replacing the backend or OIDC adapter

```ts
import { STYNX_AUTH_BACKEND, STYNX_OIDC_ADAPTER } from '@stynx-nyx/angular-auth';

providers: [
  DevOidcAdapter,
  DevAuthBackend,
  { provide: STYNX_OIDC_ADAPTER, useExisting: DevOidcAdapter },
  { provide: STYNX_AUTH_BACKEND, useExisting: DevAuthBackend },
];
```

### Example 4 — session stub in a component test

```ts
import { createStynxSessionStub, provideStynxSessionStub } from '@stynx-nyx/angular-auth/testing';

const session = createStynxSessionStub({ active: true, permissions: ['orders:*'] });
TestBed.configureTestingModule({ providers: [provideStynxSessionStub(session)] });

session.setPermissions([]);
expect(session.hasAllPermissions(['orders:delete'])).toBe(false);
```

## Common pitfalls

- **Treating UI checks as authorization.** The directive only controls display, and guards only control navigation. Backend authorization must enforce access for every protected operation.
- **`@stynx-nyx/angular` not configured.** `StynxSessionService` injects `TenantContextService` and `HttpAuthBackend` injects `STYNX_ANGULAR_OPTIONS`, both from `@stynx-nyx/angular`. Configure that package first.
- **No `HttpClient` with `provideStynxAuth`.** `HttpAuthBackend` injects `HttpClient`. `StynxAngularAuthModule` imports `HttpClientModule`; `provideStynxAuth` does not register an HTTP client, so the application must provide one.
- **No tenant at login.** `completeLogin()` takes the tenant from `TenantContextService`, then from a `tenant_id`, `tenantId` or `tenancy_id` claim of the provider token, and throws `Tenant context is required for session exchange` when none is found.
- **Callback route without the component.** Nothing completes the login unless `completeLogin()` runs on the redirect URL; mount `StynxLoginRedirectComponent` there or call the method yourself.
- **Denied route in the NgModule form.** Only `provideStynxAuth` registers a route for `StynxPermissionDeniedComponent`. With `StynxAngularAuthModule.forRoot` you declare the route for `permissionDeniedPath` yourself.
- **Required-side wildcards.** `stynxPermissionGuard('ops:*')` requires a grant that is literally `ops:*` or `*`; it does not mean "any `ops` permission".
- **Session state is in memory.** The access token and permissions live in a signal and start inactive after a page reload. `StynxSessionService` writes and clears the stored refresh token but does not read it back; a reload is recovered through `completeLogin()` or `refresh()` against the OIDC client. The `cookie` mode writes through `document.cookie`, so that cookie is readable by scripts.
- **Deprecated members.** `active$` and the `unauthorizedRoute` option are deprecated in favour of the signals and `permissionDeniedPath`.

## Related packages

- [`@stynx-nyx/angular`](/docs/packages-web/angular/) — foundation package; supplies `TenantContextService`, `STYNX_ANGULAR_OPTIONS` and the `STYNX_AUTH_PROVIDER` token this package fulfils.
- [`@stynx-nyx/sdk`](/docs/packages-web/sdk/) — defines the `AuthProvider` interface `StynxSessionService` implements.
- [`@stynx-nyx/angular-i18n`](/docs/packages-web/angular-i18n/) — `StynxTranslatePipe` used by the bundled components.
- [`@stynx-nyx/auth`](/docs/packages/auth/) — backend controller for the `/sessions`, `/sessions/switch` and `/sessions/logout` endpoints.
- [`@stynx-nyx/sessions`](/docs/packages/sessions/) — backend session issuance behind those endpoints.
- [`@stynx-nyx/angular-sessions`](/docs/packages-web/angular-sessions/) — active-session list and revoke UI; depends on this package.

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
