# `@stynx-web/angular` — Angular foundation: providers, HTTP interceptors, request context bridge

`@stynx-web/angular` is the Angular root package every other `@stynx-web/*` package builds on. It provides `provideStynxAngular()` (standalone-providers wiring), the HTTP interceptor stack (auth-token attachment, request-id propagation, tenant-header injection, error-envelope handling), a client-side request-context bridge that mirrors the backend's `RequestContext`, and shared services (error banner, toast). Wire it once at bootstrap; the rest of the `@stynx-web/*` packages assume it's present.

## Purpose

An Angular app talking to a STYNX backend needs consistent plumbing: every HTTP call must carry the bearer token, a request id (for correlation with backend logs), and the tenant header; error responses come back as STYNX error envelopes that should surface uniformly. Wiring this by hand drifts. `@stynx-web/angular` provides it as a single provider call.

You reach for it first, before any other `@stynx-web/*` package. It is the Angular-side counterpart to `@stynx/core`.

What it does NOT do: it doesn't render app UI (use `@stynx-web/angular-ui` for shared components). It doesn't manage auth state (use `@stynx-web/angular-auth`). It provides the HTTP + context substrate those build on.

## Audience

Angular frontend developers building a STYNX-backed app. Typical scenario: you scaffold a standalone Angular app, call `provideStynxAngular()` in `app.config.ts`, and every HTTP request now carries token + request-id + tenant headers automatically.

## Install

```bash
pnpm add @stynx-web/angular @stynx-web/sdk
```

**Peer dependencies:** `@angular/core` `^18`, `@angular/common` `^18`, `@stynx-web/sdk` `^1`.

## Quick start

```ts
// app.config.ts (standalone Angular)
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStynxAngular } from '@stynx-web/angular';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideStynxAngular({
      apiBaseUrl: 'https://api.example.com',
      defaultLocale: 'pt-BR',
    }),
  ],
};
```

```ts
// Legacy NgModule path
import { StynxAngularModule } from '@stynx-web/angular';

@NgModule({
  imports: [StynxAngularModule.forRoot({ apiBaseUrl: 'https://api.example.com' })],
})
export class AppModule {}
```

## Public API surface

### Providers

| Export                 | Signature                                              | Description                                                                                    |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `provideStynxAngular`  | `(config: StynxAngularConfig): EnvironmentProviders`   | Standalone-providers entry point. Registers the interceptor stack + context bridge + services. |
| `provideStynxDefaults` | `(config?: StynxDefaultsConfig): EnvironmentProviders` | Lower-level: just the defaults (base URL, locale) without the full interceptor stack.          |
| `StynxAngularModule`   | `.forRoot(config)`                                     | Legacy NgModule path.                                                                          |

### HTTP interceptors (registered by the provider)

| Export                 | Description                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------- |
| `authInterceptor`      | Attaches the bearer token from the auth store to every request.                          |
| `requestIdInterceptor` | Generates + propagates a request id (correlates with backend logs).                      |
| `tenantInterceptor`    | Injects the active tenant header.                                                        |
| `errorInterceptor`     | Maps STYNX error envelopes to typed errors + surfaces them via the error-banner service. |

### Services / Injectables

| Export                 | Description                                                 |
| ---------------------- | ----------------------------------------------------------- |
| `TenantContextService` | Client-side tenant context — current tenant, switch tenant. |
| `ErrorBannerService`   | Surface STYNX errors as a banner.                           |
| `ToastService`         | Transient toast notifications.                              |

### Components

| Selector              | Component             | Description                                     |
| --------------------- | --------------------- | ----------------------------------------------- |
| `<stynx-empty-state>` | `EmptyStateComponent` | Empty-state placeholder (no data / no results). |

### Functions / Types

| Export                | Description                           |
| --------------------- | ------------------------------------- |
| `generateRequestId`   | Client-side request-id generator.     |
| `StynxAngularConfig`  | `provideStynxAngular()` config shape. |
| `StynxDefaultsConfig` | Defaults config shape.                |

## Configuration

### `provideStynxAngular()` config

| Option                | Type      | Default         | Description                                                |
| --------------------- | --------- | --------------- | ---------------------------------------------------------- |
| `apiBaseUrl`          | `string`  | (required)      | The STYNX backend base URL. Sets the SDK's `OpenAPI.BASE`. |
| `defaultLocale`       | `string`  | `'en'`          | Locale fallback for `@stynx-web/angular-i18n`.             |
| `strictErrorEnvelope` | `boolean` | `true`          | Treat non-envelope error responses as unexpected.          |
| `tenantHeaderName`    | `string`  | `'X-Tenant-Id'` | Header the tenant interceptor injects.                     |

## Examples

### Example 1 — standalone bootstrap

```ts
bootstrapApplication(AppComponent, {
  providers: [provideHttpClient(), provideStynxAngular({ apiBaseUrl: env.apiUrl })],
});
```

### Example 2 — reading tenant context in a component

```ts
import { TenantContextService } from '@stynx-web/angular';

@Component({
  /* ... */
})
export class HeaderComponent {
  private readonly tenants = inject(TenantContextService);
  currentTenant = this.tenants.current;
}
```

### Example 3 — empty-state component

```html
<stynx-empty-state *ngIf="items.length === 0" message="No results found" />
```

## Common pitfalls

- **Missing `provideStynxAngular()`** — downstream `@stynx-web/*` packages crash on injection of services this package provides. It must be in the root providers.
- **`apiBaseUrl` not set** — the SDK makes relative-path requests against the app's own origin, returning 404s. Always set it.
- **Calling `provideHttpClient()` without `withInterceptors`** when mixing custom interceptors — order matters; STYNX's interceptors should run in the registered order.

## Related packages

- [`@stynx-web/sdk`](/docs/packages-web/sdk/) — the generated REST client this package wires.
- [`@stynx-web/angular-ui`](/docs/packages-web/angular-ui/) — shared UI components.
- [`@stynx-web/angular-auth`](/docs/packages-web/angular-auth/) — auth state + login UI (depends on this).
- [`@stynx/core`](/docs/packages/core/) — the backend counterpart (request context).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular/`](/docs/api-reference/stynx-web-angular/)
