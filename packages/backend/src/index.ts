/**
 * Compatibility backend barrel for shared NestJS modules and contracts.
 *
 * @packageDocumentation
 */
export * from '@stynx-nyx/contracts';

export * from './common/request-context.js';
export * from './event-stream/types.js';
export * from './event-stream/tokens.js';
export * from './event-stream/event-stream.module.js';
export * from './event-stream/event-stream.service.js';
export * from './webhook-signature/webhook-signature.guard.js';
export * from './webhook-signature/webhook-signature.module.js';

export * from './auth/constants.js';
export * from './auth/default-principal-mapper.js';
export * from './auth/current-principal.decorator.js';
export * from './auth/auth-context.guard.js';
export * from './auth/auth.module.js';
export * from './auth/required-tenant-header.resolver.js';
export * from './auth/claim-first-tenant-entitlement.policy.js';
export * from './auth/sql-tenant-entitlement.fallback.js';

export * from './authorization/constants.js';
export * from './authorization/decorators.js';
export * from './authorization/default-policy-evaluator.js';
export * from './authorization/authorization.guard.js';
export * from './authorization/authorization.module.js';

export * from './audit/constants.js';
export * from './audit/decorators.js';
export * from './audit/audit.interceptor.js';
export * from './audit/audit.module.js';
export * from './audit/redaction-policy.js';
export * from './transactional-command/transactional-command.js';
export * from './transactional-command/transactional-command.module.js';
export * from './if-match/if-match.js';

export * from './db-context/constants.js';
export * from './db-context/request-db-client-lifecycle.js';
export * from './db-context/tenant-lifecycle.middleware.js';
export * from './db-context/pg-session-db-context.applier.js';
export * from './db-context/db-context.interceptor.js';
export * from './db-context/db-context.module.js';

export * from './storage/constants.js';
export * from './storage/storage.module.js';

/**
 * Idempotency injection tokens and route metadata helpers.
 */
export {
  STYNX_IDEMPOTENCY_BACKEND,
  STYNX_IDEMPOTENCY_METRICS,
  STYNX_IDEMPOTENCY_OPTIONS,
  STYNX_IDEMPOTENCY_STORE,
  STYNX_IDEMPOTENT_ROUTE,
  STYNX_NO_IDEMPOTENT_ROUTE,
} from '@stynx-nyx/idempotency';
/**
 * Idempotency module, stores, interceptors, metrics, and public contracts.
 */
export {
  DatabaseIdempotencyStore,
  IdempotencyInterceptor,
  InMemoryIdempotencyMetrics,
  NoIdempotent,
  PgIdempotencyStore,
  RedisIdempotencyBackend,
  StynxIdempotencyModule,
  type IdempotencyBackend,
  type IdempotencyInterceptorOptions,
  type IdempotencyMetricsSink,
  type IdempotencyStore,
  type IdempotencyStoredEntry,
  type StynxIdempotencyModuleOptions,
} from '@stynx-nyx/idempotency';

/**
 * Rate-limit injection tokens and route metadata helpers.
 */
export {
  STYNX_RATE_LIMIT_METRICS,
  STYNX_RATE_LIMIT_OPTIONS,
  STYNX_RATE_LIMIT_POLICY,
  STYNX_RATE_LIMIT_ROUTE,
  STYNX_RATE_LIMIT_STORE,
} from '@stynx-nyx/ratelimit';
/**
 * Rate-limit module, guards, stores, metrics, and public contracts.
 */
export {
  DatabaseRateLimitPolicyResolver,
  InMemoryRateLimitMetrics,
  PgRateLimitStore,
  RateLimit,
  RateLimitGuard,
  RedisSlidingWindowRateLimitStore,
  StynxRateLimitModule,
  type RateLimitDecision,
  type RateLimitDecisionContext,
  type RateLimitGuardOptions,
  type RateLimitMetadata,
  type RateLimitMetricsSink,
  type RateLimitPolicyResolver,
  type RateLimitStore,
  type ResolvedRateLimitPolicy,
  type StynxRateLimitModuleOptions,
} from '@stynx-nyx/ratelimit';

export * from './sla/constants.js';
export * from './sla/types.js';
export * from './sla/default-sla-category.resolver.js';
export * from './sla/logger-sla-event.sink.js';
export * from './sla/sla-monitor.interceptor.js';
export * from './sla/sla.module.js';

export * from './pipeline/platform-pipeline.module.js';

export * from './identity-admin/constants.js';
export * from './identity-admin/identity-admin.module.js';
export * from './identity-admin/identity-admin.service.js';
export * from './identity-admin/integration-facades.js';
export * from './identity-admin/pg-local-sync.adapter.js';
