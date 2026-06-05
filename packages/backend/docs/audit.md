---
title: backend/audit
---

# `StynxBackendAuditModule` — `@stynx/audit` wired with the SQL sink

Wraps `@stynx/audit` with the canonical wiring: SQL sink writing to `stynx_audit_events` via `@stynx/data`, the `AuditInterceptor` registered as `APP_INTERCEPTOR`, retention policy enabled by default.

## When to mount

In any regulated app. Mount after `backend/db-context` (the SQL sink needs the DB) and after `backend/auth` (audit events need an actor).

## Wiring

```ts
import { StynxBackendAuditModule } from '@stynx/backend';

StynxBackendAuditModule.forRoot({
  retention: { keepDays: 365 * 7 },
});
```

## Configuration

Forwarded to `@stynx/audit`'s `StynxAuditModuleOptions`. See [`@stynx/audit`](/docs/packages/audit/).

## Common pitfalls

- **Mounting without `backend/db-context`** — the SQL sink can't get a DB connection.
- **High-volume audit traffic** on `stynx_audit_events` can become a write hotspot. Consider table partitioning by month + retention.

## Related

- [`@stynx/audit`](/docs/packages/audit/) — the underlying package.
- [`backend/db-context`](/docs/packages/backend/db-context/) — mount first.
- [`backend/auth`](/docs/packages/backend/auth/) — provides the actor.
