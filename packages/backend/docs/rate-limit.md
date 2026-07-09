---
title: backend/rate-limit
---

# `StynxBackendRateLimitModule` — `@stynx-nyx/ratelimit` wired as global guard

Wraps `@stynx-nyx/ratelimit` with the canonical backend wiring: Redis store, actor-keyed defaults, the `RateLimitGuard` registered as `APP_GUARD` via `StynxPlatformPipelineModule`.

## When to mount

Always, for any production app. Mount via `StynxPlatformPipelineModule.forRoot({ rateLimit: {...} })` (preferred) or directly via this submodule.

## Wiring

```ts
import { StynxBackendRateLimitModule } from '@stynx-nyx/backend';

StynxBackendRateLimitModule.forRoot({
  default: { window: '1m', max: 60, key: 'actor' },
  store: { kind: 'redis', redis: { host: 'redis.internal' } },
});
```

## Configuration

Forwarded to `@stynx-nyx/ratelimit`'s `StynxRateLimitModuleOptions`. See [`@stynx-nyx/ratelimit`](/docs/packages/ratelimit/).

## Common pitfalls

- **Mounting separately AND via `StynxPlatformPipelineModule.rateLimit`** — both register the guard; you get duplicate gating with confused metadata. Use one or the other.
- **In-memory store across instances** — per-instance counters; effective limit = `max × instances`. Use Redis.

## Related

- [`@stynx-nyx/ratelimit`](/docs/packages/ratelimit/) — the underlying package.
- [`backend/pipeline`](/docs/packages/backend/pipeline/) — the preferred mount path.
