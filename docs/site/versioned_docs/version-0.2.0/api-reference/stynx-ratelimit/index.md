**@stynx/ratelimit**

---

# @stynx/ratelimit

Public rate-limit decorators, guards, policies, stores, metrics, and module exports.

## Classes

- [DatabaseRateLimitPolicyResolver](classes/DatabaseRateLimitPolicyResolver.md)
- [InMemoryRateLimitMetrics](classes/InMemoryRateLimitMetrics.md)
- [PgRateLimitStore](classes/PgRateLimitStore.md)
- [RateLimitGuard](classes/RateLimitGuard.md)
- [RedisSlidingWindowRateLimitStore](classes/RedisSlidingWindowRateLimitStore.md)
- [StynxRateLimitModule](classes/StynxRateLimitModule.md)

## Interfaces

- [PgRateLimitStoreOptions](interfaces/PgRateLimitStoreOptions.md)
- [RateLimitDecision](interfaces/RateLimitDecision.md)
- [RateLimitDecisionContext](interfaces/RateLimitDecisionContext.md)
- [RateLimitGuardOptions](interfaces/RateLimitGuardOptions.md)
- [RateLimitMetadata](interfaces/RateLimitMetadata.md)
- [RateLimitMetricsSink](interfaces/RateLimitMetricsSink.md)
- [RateLimitPolicyResolver](interfaces/RateLimitPolicyResolver.md)
- [RateLimitSqlExecutor](interfaces/RateLimitSqlExecutor.md)
- [RateLimitStore](interfaces/RateLimitStore.md)
- [RequestLike](interfaces/RequestLike.md)
- [ResolvedRateLimitPolicy](interfaces/ResolvedRateLimitPolicy.md)
- [StynxRateLimitModuleOptions](interfaces/StynxRateLimitModuleOptions.md)

## Type Aliases

- [RateLimitBucket](type-aliases/RateLimitBucket.md)

## Variables

- [STYNX_RATE_LIMIT_METRICS](variables/STYNX_RATE_LIMIT_METRICS.md)
- [STYNX_RATE_LIMIT_OPTIONS](variables/STYNX_RATE_LIMIT_OPTIONS.md)
- [STYNX_RATE_LIMIT_POLICY](variables/STYNX_RATE_LIMIT_POLICY.md)
- [STYNX_RATE_LIMIT_ROUTE](variables/STYNX_RATE_LIMIT_ROUTE.md)
- [STYNX_RATE_LIMIT_STORE](variables/STYNX_RATE_LIMIT_STORE.md)

## Functions

- [RateLimit](functions/RateLimit.md)
