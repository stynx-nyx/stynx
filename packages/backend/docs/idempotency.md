---
title: backend/idempotency
---

# `StynxBackendIdempotencyModule` — `@stynx-nyx/idempotency` wired with the Postgres store

Wraps `@stynx-nyx/idempotency` with the canonical backend wiring: Postgres store (transactional with your business writes), actor scope, the `IdempotencyInterceptor` registered as `APP_INTERCEPTOR` via `StynxPlatformPipelineModule`.

## When to mount

Whenever you have mutating endpoints (POST/PUT/PATCH/DELETE). Mount via `StynxPlatformPipelineModule.forRoot({ idempotency: {...} })` (preferred) or directly via this submodule.

## Wiring

```ts
import { StynxBackendIdempotencyModule } from '@stynx-nyx/backend';

StynxBackendIdempotencyModule.forRoot({
  defaultTtlMs: 24 * 60 * 60_000,
  store: { kind: 'pg' }, // default; transactional with business writes
  scope: 'actor',
});
```

## Configuration

Forwarded to `@stynx-nyx/idempotency`'s `StynxIdempotencyModuleOptions`. See [`@stynx-nyx/idempotency`](/docs/packages/idempotency/).

## Common pitfalls

- **Postgres store on a separate DB connection** from the business writes — the interceptor's "stored" state and the business write can fall out of sync if one commits and the other rolls back. Use the same `DataSource`.
- **`@Idempotent` decorator on streaming endpoints** — currently buffers the full response; not appropriate for streams.

## Related

- [`@stynx-nyx/idempotency`](/docs/packages/idempotency/) — the underlying package.
- [`backend/pipeline`](/docs/packages/backend/pipeline/) — the preferred way to mount.
- [`backend/db-context`](/docs/packages/backend/db-context/) — provides the DB connection the Postgres store uses.
