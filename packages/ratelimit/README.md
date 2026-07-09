# `@stynx-nyx/ratelimit` — sliding-window rate limit with per-route policy + Redis/Postgres stores

`@stynx-nyx/ratelimit` is the sliding-window rate-limit primitive. Apply per-route policy via `@RateLimit({ window, max, key })`, and the global `RateLimitGuard` (mounted by `StynxPlatformPipelineModule` from `@stynx-nyx/backend`, or directly by this module) rejects with 429 when the window's limit is exceeded. Stores: in-memory (dev), Postgres-table (lower throughput, simple), Redis (production, single-digit-ms latency).

## Purpose

Production APIs need rate limits per-route per-key (per-actor, per-tenant, per-IP). Doing this with a single global limit isn't fine-grained enough; doing it per-route by hand is error-prone. `@stynx-nyx/ratelimit` provides a single decorator + store abstraction with the sliding-window algorithm baked in.

You reach for it any time you expose a public or semi-public endpoint that could be flooded. The `StynxPlatformPipelineModule` wires it globally; you only annotate routes.

What it does NOT do: not a circuit breaker (use `@stynx-nyx/integration-adapter` for outbound calls), not DDoS protection (use upstream WAF), no jittering/exponential-backoff hints (client-side concern).

## Audience

Backend developers protecting endpoints from abuse, runaway clients, or noisy neighbours.

## Install

```bash
pnpm add @stynx-nyx/ratelimit
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx-nyx/core` `^1`, `ioredis` (optional, Redis store), `drizzle-orm` (optional, Postgres store).

## Quick start

```ts
import { StynxRateLimitModule } from '@stynx-nyx/ratelimit';

StynxRateLimitModule.forRoot({
  default: { window: '1m', max: 60, key: 'actor' },
  store: { kind: 'redis', redis: { host: 'redis.internal' } },
});
```

```ts
import { RateLimit } from '@stynx-nyx/ratelimit';

@Controller('orders')
export class OrdersController {
  @Post()
  @RateLimit({ window: '1m', max: 30, key: 'actor' })
  create() {
    /* ... */
  }
}
```

## Public API surface

### Modules

| Export                 | Signature                                        | Description                                      |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------ |
| `StynxRateLimitModule` | `.forRoot(options: StynxRateLimitModuleOptions)` | Registers guard, store, policy service, metrics. |

### Services / Injectables

| Export                   | Description                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------- |
| `RateLimitGuard`         | The `CanActivate` guard. Registers as `APP_GUARD` when wired via `StynxPlatformPipelineModule`. |
| `RateLimitPolicyService` | Reads route metadata + module defaults to derive the effective policy.                          |
| `RateLimitMetrics`       | Allowed/blocked counters; sliding-window observation.                                           |
| `PgRateLimitStore`       | Postgres-backed store.                                                                          |
| `RedisRateLimitStore`    | Redis-backed store (preferred for production).                                                  |

### Decorators

| Export                                     | Targets        | Description                                                                                                                                                                               |
| ------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@RateLimit({ window, max, key, scope? })` | Method + class | Per-route policy. `window`: e.g. `'1m'`, `'10s'`. `max`: requests allowed. `key`: identity dimension (`'actor'`, `'tenant'`, `'ip'`, or `(req) => string`). `scope`: optional sub-bucket. |

### Types / Interfaces

| Export                        | Description                 |
| ----------------------------- | --------------------------- |
| `StynxRateLimitModuleOptions` | `forRoot()` options.        |
| `RateLimitMetadata`           | Decorator's metadata shape. |
| `RateLimitStore`              | Store interface.            |

## Configuration

### `StynxRateLimitModule.forRoot()` options

| Option         | Type                             | Default                                   | Description                            |
| -------------- | -------------------------------- | ----------------------------------------- | -------------------------------------- |
| `default`      | `RateLimitMetadata`              | `{ window: '1m', max: 60, key: 'actor' }` | Default policy for unannotated routes. |
| `store.kind`   | `'in-memory' \| 'pg' \| 'redis'` | `'in-memory'`                             | Backend.                               |
| `store.redis`  | `RedisOptions`                   | n/a                                       | Redis config.                          |
| `store.pg`     | `{ tableName }`                  | `'stynx_rate_limit'`                      | Postgres table name.                   |
| `keyResolvers` | `Record<string, KeyResolver>`    | built-ins                                 | Add custom key resolvers.              |

## Examples

### Example 1 — per-tenant limit

```ts
@RateLimit({ window: '1m', max: 100, key: 'tenant' })
```

100 requests per tenant per minute.

### Example 2 — class-level + per-method override

```ts
@Controller('webhooks')
@RateLimit({ window: '1s', max: 10, key: 'ip' }) // default for all methods
export class WebhooksController {
  @Post('high-priority')
  @RateLimit({ window: '1s', max: 100, key: 'ip' }) // override for this method
  highPriority() {
    /* ... */
  }
}
```

### Example 3 — custom key resolver

```ts
StynxRateLimitModule.forRoot({
  keyResolvers: {
    apiKey: (req) => req.headers['x-api-key'] ?? 'anon',
  },
  default: { window: '1m', max: 60, key: 'apiKey' },
});
```

## Common pitfalls

- **In-memory store across multiple instances** — each instance has its own counter; effective limit is `max × instances`. Use Redis in prod.
- **Clock skew across nodes** with the Redis store — the sliding window uses node-local time. NTP sync mitigates.
- **`@RateLimit` decorator without `StynxRateLimitModule.forRoot()` or `StynxPlatformPipelineModule`** — metadata is set, guard isn't wired; limit doesn't apply.
- **Key collisions when migrating** — switching `key: 'ip'` → `key: 'actor'` mid-deploy: existing in-flight buckets still count under the old key. Either drain or accept transient over-limit.

## Related packages

- [`@stynx-nyx/core`](/docs/packages/core/) — provides `RequestContext` for the `actor` / `tenant` key resolvers.
- [`backend/rate-limit`](/docs/packages/backend/rate-limit/) — `@stynx-nyx/backend` submodule that wraps wiring.
- [`@stynx-nyx/idempotency`](/docs/packages/idempotency/) — adjacent concern (replay protection); both registered by `StynxPlatformPipelineModule`.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-ratelimit/`](/docs/api-reference/stynx-ratelimit/)
