# `@stynx-nyx/angular` — Angular foundation: providers, HTTP interceptors, request context bridge

`@stynx-nyx/angular` is the Angular root package every other `@stynx-nyx/*` package builds on. It provides `provideStynxAngular()` (standalone-providers wiring), the HTTP interceptor stack (auth-token attachment, request-id propagation, tenant-header injection, error-envelope handling), a client-side request-context bridge that mirrors the backend's `RequestContext`, and shared services (error banner, toast). Wire it once at bootstrap; the rest of the `@stynx-nyx/*` packages assume it's present.

## Purpose

An Angular app talking to a STYNX backend needs consistent plumbing: every HTTP call must carry the bearer token, a request id (for correlation with backend logs), and the tenant header; error responses come back as STYNX error envelopes that should surface uniformly. Wiring this by hand drifts. `@stynx-nyx/angular` provides it as a single provider call.

You reach for it first, before any other `@stynx-nyx/*` package. It is the Angular-side counterpart to `@stynx-nyx/core`.

What it does NOT do: it doesn't render app UI (use `@stynx-nyx/angular-ui` for shared components). It doesn't manage auth state (use `@stynx-nyx/angular-auth`). It provides the HTTP + context substrate those build on.

## Audience

Angular frontend developers building a STYNX-backed app. Typical scenario: you scaffold a standalone Angular app, call `provideStynxAngular()` in `app.config.ts`, and every HTTP request now carries token + request-id + tenant headers automatically.

## Install

```bash
pnpm add @stynx-nyx/angular @stynx-nyx/sdk
```

**Dependencies and version ranges:** see [Generated dependency reference](#generated-dependency-reference).

## Quick start

```ts
// app.config.ts (standalone Angular)
import { ApplicationConfig } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideStynxAngular } from '@stynx-nyx/angular';

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
import { StynxAngularModule } from '@stynx-nyx/angular';

@NgModule({
  imports: [StynxAngularModule.forRoot({ apiBaseUrl: 'https://api.example.com' })],
})
export class AppModule {}
```

### Opt-in idempotency keys for commands

STYNX 1.5 adds `provideStynxIdempotency()` and
`STYNX_IDEMPOTENCY_COMMAND`. Register the provider once with
`provideHttpClient(withInterceptorsFromDi())`, then mark each command
request explicitly:

```ts
import {
  HttpClient,
  HttpContext,
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import { provideStynxIdempotency, STYNX_IDEMPOTENCY_COMMAND } from '@stynx-nyx/angular';

const providers = [provideHttpClient(withInterceptorsFromDi()), provideStynxIdempotency()];
function createRecord(http: HttpClient) {
  const context = new HttpContext().set(STYNX_IDEMPOTENCY_COMMAND, {
    action: 'record.create',
    target: 'record-7',
    includeBodyHash: true,
  });
  return http.post(
    '/records',
    { title: 'Example' },
    {
      context,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}
```

The body-hash form requires a plain JSON object or array. For a bodyless
DELETE, use `{ key: stableOperationKey }` instead. Existing
`Idempotency-Key` headers win; GET, HEAD, SSE, and unmarked requests are
unchanged. `canonicalJson` uses Unicode code-point key order and rejects
values that JSON would silently omit; `sha256Hex` requires Web Crypto.

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
| `defaultLocale`       | `string`  | `'en'`          | Locale fallback for `@stynx-nyx/angular-i18n`.             |
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
import { TenantContextService } from '@stynx-nyx/angular';

@Component({/* ... */})
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

- **Missing `provideStynxAngular()`** — downstream `@stynx-nyx/*` packages crash on injection of services this package provides. It must be in the root providers.
- **`apiBaseUrl` not set** — the SDK makes relative-path requests against the app's own origin, returning 404s. Always set it.
- **Calling `provideHttpClient()` without `withInterceptors`** when mixing custom interceptors — order matters; STYNX's interceptors should run in the registered order.

## Server-sent events

Configure the normal bearer, tenant, and request-ID interceptors before the stream. Pass an application-owned session signal; `@stynx-nyx/angular` does not depend on `@stynx-nyx/angular-auth`.

```ts
import { Injectable, effect, inject, provideAppInitializer, signal } from '@angular/core';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { provideStynxDefaults, provideStynxEventStream } from '@stynx-nyx/angular';
import type { AuthProvider } from '@stynx-nyx/sdk';

const sessionActive = signal(false);

@Injectable({ providedIn: 'root' })
class EventStreamSessionBridge {
  private readonly session = inject(StynxSessionService);
  constructor() {
    effect(() => sessionActive.set(this.session.active()));
  }
}

// In application providers, with the same bridge signal:
function eventStreamProviders(
  authProvider: AuthProvider,
  resolveTenant: () => Promise<string | null>,
) {
  return [
    provideStynxDefaults({
      angular: { apiBaseUrl: '/api', sessionMode: 'bearer', authProvider },
      tenancy: { defaultTenantResolver: resolveTenant },
    }),
    provideAppInitializer(() => {
      inject(EventStreamSessionBridge);
    }),
    provideStynxEventStream({
      url: '/api/stream',
      pollingIntervalMs: 15_000,
      sessionActive: sessionActive.asReadonly(),
    }),
  ];
}
```

`StynxEventStreamService` exposes `status`, `polling`, and `lastEventId` signals, parsed `events$`, and polling `tick$`. The HTTP transport receives intercepted bearer and tenant headers. It reconnects with `Last-Event-ID`, bounds each connection's received bytes and age, and stops when the session signal becomes false. A byte ceiling reached before any accepted cursor advance on that connection counts as a failed attempt, with backoff and eventual polling at the configured failure threshold; this prevents repeated immediate reconnects on a first frame larger than the limit. Once the cursor has advanced, a byte ceiling reconnect is planned and does not count as a failure. Applications should set backend `maxPayloadBytes` sufficiently below client `maxConnectionBytes` to leave room for SSE framing and comments. Tests can replace the transport and clock with `FakeStynxEventStreamTransport` and `FakeStynxEventStreamClock` from `@stynx-nyx/angular/testing`.

The application must resolve or set its current tenant through `TenantContextService` before starting the stream. `TenantInterceptor` then supplies `X-Tenant-Id`; the SSE service does not derive it from event data.

### Opt-in stream options

Each option below is set per `provideStynxEventStream` call and defaults to the 1.5.0 behavior. The [SSE contract](/docs/framework/contracts/sse-1.5) defines them exactly.

| Option or member                  | Effect                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `reopenOnPollingEntry: 'backoff'` | The failure that enters polling reopens after the normal retry delay instead of at once.                                                                |
| `commentActivity: 'live'`         | A comment line such as `: heartbeat` returns the stream to `live` and clears the failure counters.                                                      |
| `retryAfterFrom(error, body)`     | Adds a retry delay in milliseconds read from an HTTP error body; the reopen waits for the largest of backoff, `Retry-After` and this value.             |
| `serverClose`                     | Policy for a stream the server ends without an error; see below.                                                                                        |
| `resync$`                         | Emits once when a held cursor is discarded, with the reason `'no-content'`, `'tenant-change'` or `'server-close'`. Reload state by query when it fires. |
| `lastError`                       | Signal with the most recent transport error: `status`, decoded `body`, `at` and `outcome`.                                                              |

`serverClose` has three independent fields. `ok` decides whether a 200 response whose body ends counts as a failure (`'failure'`, the default) or is a normal end of stream (`'end-of-stream'`) that stays out of the failure window and never leads to polling by itself. `cursor` decides whether that 200 keeps `Last-Event-ID` (`'keep'`, the default) or discards it (`'discard'`), which emits `resync$` with `'server-close'`; a 204 always discards. `reopen` sets the delay after a close that is not a failure, which is a 204 or a 200 under `'end-of-stream'`: `'backoff'` (the default), `'immediate'`, or `'immediate-after-frame'`, which reopens at once only when the closed connection delivered a frame.

```ts
provideStynxEventStream({
  url: '/api/stream',
  pollingIntervalMs: 30_000,
  sessionActive: sessionActive.asReadonly(),
  commentActivity: 'live',
  serverClose: { ok: 'end-of-stream', cursor: 'discard', reopen: 'immediate-after-frame' },
});
```

`reopen: 'immediate'` has no rate limit: a server that closes every request at once is asked again without pause. Prefer `'immediate-after-frame'` unless the server holds an idle stream open.

## Related packages

- [`@stynx-nyx/sdk`](/docs/packages-web/sdk/) — the generated REST client this package wires.
- [`@stynx-nyx/angular-ui`](/docs/packages-web/angular-ui/) — shared UI components.
- [`@stynx-nyx/angular-auth`](/docs/packages-web/angular-auth/) — auth state + login UI (depends on this).
- [`@stynx-nyx/core`](/docs/packages/core/) — the backend counterpart (request context).

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-web-angular/`](/docs/api-reference/stynx-web-angular/)

<!-- stynx:generated-dependencies:start -->

## Generated dependency reference

This section is generated from `package.json`. Run `pnpm package-readmes:write` to update it.

### Runtime dependencies

- `@stynx-nyx/angular-tenancy`: `workspace:*`
- `@stynx-nyx/sdk`: `workspace:*`
- `rxjs`: `^7.8.2`

### Optional dependencies

_None._

### Peer dependencies

- `@angular/common`: `>=22.0.0 <23`
- `@angular/core`: `>=22.0.0 <23`
- `@angular/router`: `>=22.0.0 <23`

### Development-only dependencies

- `@angular/common`: `22.2.1`
- `@angular/compiler`: `22.2.1`
- `@angular/compiler-cli`: `22.2.1`
- `@angular/core`: `22.2.1`
- `@angular/platform-browser`: `22.2.1`
- `@angular/platform-browser-dynamic`: `22.2.1`
- `@angular/router`: `22.2.1`
- `@types/node`: `24.13.4`
- `cross-env`: `^10.1.0`
- `jsdom`: `^29.0.2`
- `ng-packagr`: `22.1.1`
- `tslib`: `^2.8.1`
- `typescript`: `6.0.3`

<!-- stynx:generated-dependencies:end -->
