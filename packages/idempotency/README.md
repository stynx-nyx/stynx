# `@stynx/idempotency` — replay-safe writes via `Idempotency-Key` header + interceptor

`@stynx/idempotency` is the idempotency-key interceptor. Mark a write endpoint with `@Idempotent()`, and the interceptor reads the client's `Idempotency-Key` header on each call: a fresh key proceeds and stores the response; a repeated key replays the stored response without re-executing the handler. Stores: in-memory (dev), Postgres-table (default; transactional with your business writes), Redis (lower latency).

## Purpose

POST/PUT/PATCH endpoints often retry — flaky network, mobile app reconnect, queue redelivery. Without idempotency keys, retries cause duplicate side-effects (double charge, double order). `@stynx/idempotency` resolves this with a tiny decorator + the right store choice.

You reach for it on every mutating endpoint whose duplicate execution is unsafe. Wired globally via `StynxPlatformPipelineModule` from `@stynx/backend`.

What it does NOT do: it doesn't make a non-idempotent operation idempotent (it caches the response only). It doesn't replay streaming responses. It doesn't deduplicate across actors with the same key (keys are scoped to actor by default).

## Audience

Backend developers building POST/PUT/PATCH endpoints, mobile-facing APIs, queue consumers.

## Install

```bash
pnpm add @stynx/idempotency
```

**Peer dependencies:** `@nestjs/common` `^11`, `@stynx/core` `^1`, `@stynx/data` `^1` (for the default Postgres store), `ioredis` (optional, Redis store).

## Quick start

```ts
import { StynxIdempotencyModule } from '@stynx/idempotency';

StynxIdempotencyModule.forRoot({
  defaultTtlMs: 24 * 60 * 60_000,
  store: { kind: 'pg' },
});
```

```ts
import { Idempotent } from '@stynx/idempotency';

@Controller('orders')
export class OrdersController {
  @Post()
  @Idempotent()
  create(@Body() body: CreateOrderDto) {
    /* ... */
  }
}
```

Now `POST /orders` with header `Idempotency-Key: abc123` replays the cached response on subsequent identical-key requests.

## Public API surface

### Modules

| Export                   | Signature                                          | Description                            |
| ------------------------ | -------------------------------------------------- | -------------------------------------- |
| `StynxIdempotencyModule` | `.forRoot(options: StynxIdempotencyModuleOptions)` | Registers interceptor, store, metrics. |

### Services / Injectables

| Export                        | Description                                                                                |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| `IdempotencyInterceptor`      | The `APP_INTERCEPTOR` registered globally (via `StynxPlatformPipelineModule` or directly). |
| `IdempotencyStore` (DI alias) | The active store; resolved from `options.store.kind`.                                      |
| `PgIdempotencyStore`          | Default. Transactional with the business write (same DB connection).                       |
| `DatabaseIdempotencyStore`    | Generic-DB variant.                                                                        |
| `RedisIdempotencyBackend`     | Redis-backed store.                                                                        |
| `IdempotencyMetrics`          | Hit/miss/stored counters.                                                                  |

### Decorators

| Export                             | Targets        | Description                                                                                      |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------ |
| `@Idempotent(headerName?, ttlMs?)` | Method + class | Mark a route as idempotency-protected. Default header is `Idempotency-Key`.                      |
| `@NoIdempotent()`                  | Method + class | Opt-out — used when the global default applies idempotency but this specific route shouldn't be. |

### Types / Interfaces

| Export                          | Description                                                                |
| ------------------------------- | -------------------------------------------------------------------------- |
| `StynxIdempotencyModuleOptions` | `forRoot()` options.                                                       |
| `IdempotencyRecord`             | Persisted shape: `{ key, actorId, requestHash, responseBody, expiresAt }`. |

## Configuration

### `StynxIdempotencyModule.forRoot()` options

| Option               | Type                              | Default                                            | Description          |
| -------------------- | --------------------------------- | -------------------------------------------------- | -------------------- |
| `defaultTtlMs`       | `number`                          | `86_400_000` (24h)                                 | Key TTL.             |
| `store.kind`         | `'in-memory' \| 'pg' \| 'redis'`  | `'in-memory'` (dev) / `'pg'` (prod recommendation) | Backend.             |
| `store.redis`        | `RedisOptions`                    | n/a                                                | Redis config.        |
| `store.pg.tableName` | `string`                          | `'stynx_idempotency'`                              | Postgres table name. |
| `scope`              | `'actor' \| 'tenant' \| 'global'` | `'actor'`                                          | Key scoping.         |
| `headerName`         | `string`                          | `'Idempotency-Key'`                                | Header to read.      |

## Examples

### Example 1 — different TTL per endpoint

```ts
@Post('charge')
@Idempotent('Idempotency-Key', 60 * 60_000)  // 1h
charge() { /* ... */ }
```

### Example 2 — opt-out on a fully-idempotent route

```ts
@StynxPlatformPipelineModule.forRoot({ idempotency: {} })  // global default applies
// ...
@Get('search')
@NoIdempotent()  // GETs are naturally idempotent; skip
search() { /* ... */ }
```

### Example 3 — per-tenant scoping

```ts
StynxIdempotencyModule.forRoot({ scope: 'tenant', store: { kind: 'pg' } });
```

Same key can be reused across tenants without colliding.

## Common pitfalls

- **Different request bodies, same key** — the store rejects with 409 (request-hash mismatch). Either the client used the wrong key or the request body legitimately changed; client must use a fresh key.
- **Replaying a streamed response** — currently unsupported; the interceptor buffers the full response before storing. Don't use `@Idempotent()` on streaming endpoints.
- **TTL too short** — legitimate retries (e.g. user opens app the next day on flaky network) miss the cache and re-execute. Tune by use case.
- **`@Idempotent()` without the interceptor wired** — the decorator's metadata is set but doesn't enforce. Wire via `StynxPlatformPipelineModule` or `StynxIdempotencyModule.forRoot()`.

## Related packages

- [`@stynx/core`](/docs/packages/core/) — provides `RequestContext` for the actor scope.
- [`@stynx/data`](/docs/packages/data/) — provides the Postgres store's DB connection.
- [`@stynx/ratelimit`](/docs/packages/ratelimit/) — adjacent (replay+limit are often paired).
- [`backend/idempotency`](/docs/packages/backend/idempotency/) — `@stynx/backend` submodule that wraps wiring.

## TypeDoc reference

Full symbol-level API: [`/docs/api-reference/stynx-idempotency/`](/docs/api-reference/stynx-idempotency/)
