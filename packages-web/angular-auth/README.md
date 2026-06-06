# `@stynx-web/angular-auth` — Angular auth: login, guards, permission directives, session

`@stynx-web/angular-auth` is the Angular authentication package. It provides route guards (`authGuard`, `permissionGuard`), a `*hasPermission` structural directive for conditional UI, login-redirect + logout-button + permission-denied components, an OIDC client adapter, a session service, and pluggable token storage. Pairs with the backend's [`@stynx/auth`](/docs/packages/auth/). Provides the auth-token resolver that `@stynx-web/sdk` consumes.

## Purpose

Frontend auth means: redirecting unauthenticated users to login, guarding routes by permission, hiding UI the user can't use, storing + refreshing tokens, and feeding the token to the API client. `@stynx-web/angular-auth` packages all of it.

You reach for it right after `@stynx-web/angular`, whenever the app has protected routes or per-permission UI.

What it does NOT do: it doesn't manage users/roles (that's `@stynx-web/angular-iam`). It doesn't issue tokens (the backend + IdP do).

## Audience

Angular frontend developers building authenticated apps.

## Install

```bash
pnpm add @stynx-web/angular-auth
```

**Peer dependencies:** `@angular/core` `^18`, `@angular/router` `^18`, `@stynx-web/angular` `^1`, `@stynx-web/sdk` `^1`.

## Quick start

```ts
import { provideAuth } from '@stynx-web/angular-auth';

export const appConfig = {
  providers: [
    provideStynxAngular({ apiBaseUrl: env.apiUrl }),
    provideAuth({ oidc: { authority: env.authUrl, clientId: env.clientId } }),
  ],
};
```

```ts
// Guard a route
import { authGuard, permissionGuard } from '@stynx-web/angular-auth';

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [authGuard, permissionGuard('admin:access')],
    component: AdminPage,
  },
];
```

## Public API surface

### Providers

| Export                   | Signature                                    | Description                                                    |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------- |
| `provideAuth`            | `(config: AuthConfig): EnvironmentProviders` | Registers guards, session service, OIDC client, token storage. |
| `StynxAngularAuthModule` | `.forRoot(config)`                           | Legacy NgModule path.                                          |

### Guards

| Export                  | Description                                                                    |
| ----------------------- | ------------------------------------------------------------------------------ |
| `authGuard`             | `CanActivate` — redirects to login if not authenticated.                       |
| `permissionGuard(perm)` | `CanActivate` factory — requires a permission; redirects to permission-denied. |

### Directives

| Export           | Usage                                                   | Description                                                                   |
| ---------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `*hasPermission` | `<button *hasPermission="'orders:create'">New</button>` | Structural directive — renders content only if the user holds the permission. |

### Components

| Selector                    | Component                   | Description                        |
| --------------------------- | --------------------------- | ---------------------------------- |
| `<stynx-login-redirect>`    | `LoginRedirectComponent`    | Initiates the OIDC login redirect. |
| `<stynx-logout-button>`     | `LogoutButtonComponent`     | Logout action.                     |
| `<stynx-permission-denied>` | `PermissionDeniedComponent` | 403 landing.                       |

### Services

| Export              | Description                                                   |
| ------------------- | ------------------------------------------------------------- |
| `SessionService`    | Current session, login, logout, token refresh.                |
| `OidcClientAdapter` | OIDC flow implementation.                                     |
| `HttpAuthBackend`   | The auth-provider impl the SDK consumes for token resolution. |

### Types

| Export       | Description             |
| ------------ | ----------------------- |
| `AuthConfig` | `provideAuth()` config. |

## Configuration

| Option             | Type                                             | Default                  | Description                  |
| ------------------ | ------------------------------------------------ | ------------------------ | ---------------------------- |
| `oidc.authority`   | `string`                                         | (required)               | OIDC issuer URL.             |
| `oidc.clientId`    | `string`                                         | (required)               | OIDC client id.              |
| `oidc.redirectUri` | `string`                                         | app origin + `/callback` | Post-login redirect.         |
| `tokenStorage`     | `'localStorage' \| 'sessionStorage' \| 'memory'` | `'localStorage'`         | Where tokens persist.        |
| `loginRoute`       | `string`                                         | `'/login'`               | Where `authGuard` redirects. |

## Examples

### Example 1 — permission-gated button

```html
<button *hasPermission="'orders:delete'" (click)="delete()">Delete</button>
```

### Example 2 — reading session state

```ts
import { SessionService } from '@stynx-web/angular-auth';

@Component({
  /* ... */
})
export class Header {
  private readonly session = inject(SessionService);
  user = this.session.currentUser; // signal
}
```

### Example 3 — logout

```html
<stynx-logout-button label="Sign out" />
```

## Common pitfalls

- **`provideAuth()` before `provideStynxAngular()`** — auth depends on the foundation's HTTP stack; order the providers foundation-first.
- **`*hasPermission` for security** — it hides UI but doesn't enforce; the backend guard is the real gate. Never rely on the directive alone.
- **Token storage in `localStorage` + XSS risk** — `localStorage` tokens are readable by injected scripts. For higher-security apps use `memory` + silent refresh.

## Related packages

- [`@stynx-web/angular`](/docs/packages-web/angular/) — the foundation.
- [`@stynx/auth`](/docs/packages/auth/) — the backend counterpart.
- [`@stynx-web/angular-iam`](/docs/packages-web/angular-iam/) — admin UI for users/roles (depends on this).
- [`@stynx-web/sdk`](/docs/packages-web/sdk/) — consumes this package's auth provider.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular-auth/`](/docs/api-reference/stynx-web-angular-auth/)
