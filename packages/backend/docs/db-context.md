---
title: backend/db-context
---

# `StynxDbContextModule` — request-scoped DB session with `SET LOCAL` RLS projection

`StynxDbContextModule` wraps `@stynx-nyx/data` with the canonical request-scoped DB-session lifecycle: per-request connection from the pool, `SET LOCAL` of `stynx_request_id` / `stynx_actor_id` / `stynx_tenant_id` so RLS policies see the right context, transaction propagation through the request frame, archive-aware soft-delete cascade primitives.

## When to mount

Whenever the app touches Postgres. Mount after `backend/auth` (so `RequestContext` has the actor) and after `backend/pipeline` (so interceptors register in the right order).

## Wiring

```ts
import { StynxDbContextModule } from '@stynx-nyx/backend';

StynxDbContextModule.forRoot({
  connection: { url: process.env.DATABASE_URL },
  schema: drizzleSchema,
});
```

## Configuration

Forwarded to `@stynx-nyx/data`'s `StynxDataOptions`. See [`@stynx-nyx/data`](/docs/packages/data/).

## Common pitfalls

- **Queries outside a request frame** — `SET LOCAL` doesn't fire; RLS rejects or leaks. Use `SystemContext` from `@stynx-nyx/core` for cron paths.
- **Transaction spanning multiple HTTP requests** — request-scoped connection closes at request end; cross-request transactions are not supported.

## Related

- [`@stynx-nyx/data`](/docs/packages/data/) — the underlying package.
- [`@stynx-nyx/contracts`](/docs/packages/contracts/) — defines `DbContextApplier`.
- [`backend/auth`](/docs/packages/backend/auth/) — provides actor; mount first.
