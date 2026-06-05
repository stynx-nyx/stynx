**@stynx/idempotency**

---

# @stynx/idempotency

Public idempotency decorators, interceptors, stores, metrics, and module exports.

## Classes

- [DatabaseIdempotencyStore](classes/DatabaseIdempotencyStore.md)
- [IdempotencyInterceptor](classes/IdempotencyInterceptor.md)
- [InMemoryIdempotencyMetrics](classes/InMemoryIdempotencyMetrics.md)
- [PgIdempotencyStore](classes/PgIdempotencyStore.md)
- [RedisIdempotencyBackend](classes/RedisIdempotencyBackend.md)
- [StynxIdempotencyModule](classes/StynxIdempotencyModule.md)

## Interfaces

- [IdempotencyBackend](interfaces/IdempotencyBackend.md)
- [IdempotencyDecisionContext](interfaces/IdempotencyDecisionContext.md)
- [IdempotencyInterceptorOptions](interfaces/IdempotencyInterceptorOptions.md)
- [IdempotencyMetricsSink](interfaces/IdempotencyMetricsSink.md)
- [IdempotencySqlExecutor](interfaces/IdempotencySqlExecutor.md)
- [IdempotencyStore](interfaces/IdempotencyStore.md)
- [IdempotencyStoredEntry](interfaces/IdempotencyStoredEntry.md)
- [IdempotentMetadata](interfaces/IdempotentMetadata.md)
- [PgIdempotencyStoreOptions](interfaces/PgIdempotencyStoreOptions.md)
- [RequestLike](interfaces/RequestLike.md)
- [StynxIdempotencyModuleOptions](interfaces/StynxIdempotencyModuleOptions.md)

## Variables

- [STYNX_IDEMPOTENCY_BACKEND](variables/STYNX_IDEMPOTENCY_BACKEND.md)
- [STYNX_IDEMPOTENCY_METRICS](variables/STYNX_IDEMPOTENCY_METRICS.md)
- [STYNX_IDEMPOTENCY_OPTIONS](variables/STYNX_IDEMPOTENCY_OPTIONS.md)
- [STYNX_IDEMPOTENCY_STORE](variables/STYNX_IDEMPOTENCY_STORE.md)
- [STYNX_IDEMPOTENT_ROUTE](variables/STYNX_IDEMPOTENT_ROUTE.md)
- [STYNX_NO_IDEMPOTENT_ROUTE](variables/STYNX_NO_IDEMPOTENT_ROUTE.md)

## Functions

- [Idempotent](functions/Idempotent.md)
- [NoIdempotent](functions/NoIdempotent.md)
