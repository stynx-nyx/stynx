---
title: backend/pipeline
---

# `StynxPlatformPipelineModule` — the global request pipeline

The platform pipeline is the foundation submodule of `@stynx-nyx/backend`. It wires three cross-cutting concerns as global guards/interceptors so they apply uniformly to every controller method:

- **Rate-limit guard** (from `@stynx-nyx/ratelimit`) — sliding-window guard registered as `APP_GUARD`
- **SLA monitor interceptor** (from the backend's own `sla/` submodule) — registered as `APP_INTERCEPTOR`
- **Idempotency interceptor** (from `@stynx-nyx/idempotency`) — registered as `APP_INTERCEPTOR`

Mount this **first** after `StynxCoreModule`. Every other backend submodule (auth, audit, data, etc.) layers on top.

## When to mount

Always, for every STYNX-based NestJS app. The three concerns it wires (rate-limit, SLA, idempotency) are non-negotiable infrastructure for any production-grade backend; the pipeline lets you turn them off individually if your app has good reasons, but the default-on posture is correct for the typical case.

## Wiring

```ts
import { StynxPlatformPipelineModule } from '@stynx-nyx/backend';

StynxPlatformPipelineModule.forRoot({
  rateLimit: { default: { window: '1m', max: 60 } },
  sla: { thresholds: { p99: '500ms', p50: '100ms' } },
  idempotency: { ttl: '24h' },
});
```

Each of the three keys takes the underlying package's options OR `false` to disable.

## Configuration

| Option        | Type                                     | Default               | Description                                                              |
| ------------- | ---------------------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `rateLimit`   | `StynxRateLimitModuleOptions \| false`   | enabled with defaults | The rate-limit options from `@stynx-nyx/ratelimit`. Pass `false` to disable. |
| `sla`         | `StynxSlaModuleOptions \| false`         | enabled with defaults | SLA threshold config. Per-route + per-handler overrides supported.       |
| `idempotency` | `StynxIdempotencyModuleOptions \| false` | enabled with defaults | The idempotency options from `@stynx-nyx/idempotency`.                       |

## Order of execution

For each request, the interceptors/guards fire in this order:

1. **Rate-limit guard** — rejects with 429 if the route's rate-limit is exceeded.
2. **Auth guard** — rejects with 401 if no valid principal. (Registered by `backend/auth` submodule.)
3. **Authorization guard** — rejects with 403 if principal lacks permissions. (Registered by `backend/authorization` submodule.)
4. **Idempotency interceptor** — replays cached response if `Idempotency-Key` header matches a recent request.
5. **DB-context interceptor** — opens a request-scoped DB session with tenant context. (Registered by `backend/db-context` submodule.)
6. **Audit interceptor** — captures pre-call snapshot for mutating endpoints. (Registered by `backend/audit` submodule.)
7. **Your handler.**
8. **Audit interceptor (post)** — emits audit event with after-snapshot.
9. **SLA monitor interceptor (post)** — records timing against thresholds.

You don't control this order directly — the platform pipeline sets it. Don't try to reorder by registering your own `APP_INTERCEPTOR`s in between unless you know what you're doing.

## Common pitfalls

- **Disabling all three (`rateLimit: false`, `sla: false`, `idempotency: false`) is technically valid** but defeats the point of importing the platform pipeline at all. If you truly want none of them, skip the import.
- **`@RateLimit({ window, max })` decorator without the rate-limit guard registered** — the decorator's metadata is read but the guard doesn't run; rate limits silently don't apply.
- **Idempotency cache hits returning stale data** — the cache is keyed on `(actor, idempotency-key)`. If your app fans out a request that mutates per-tenant data with a per-actor key, an actor switching tenants sees stale results.

## Related

- [`@stynx-nyx/ratelimit`](/docs/packages/ratelimit/) — the underlying rate-limit primitives.
- [`@stynx-nyx/idempotency`](/docs/packages/idempotency/) — the underlying idempotency primitives.
- [`backend/auth`](/docs/packages/backend/auth/) — the next submodule typically mounted (live after W03).
