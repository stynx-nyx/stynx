/**
 * Compatibility backend barrel for shared NestJS modules and contracts.
 *
 * @packageDocumentation
 */
export * from '@stynx/contracts';

export * from './common/request-context';

export * from './auth/constants';
export * from './auth/default-principal-mapper';
export * from './auth/current-principal.decorator';
export * from './auth/auth-context.guard';
export * from './auth/auth.module';
export * from './auth/required-tenant-header.resolver';
export * from './auth/claim-first-tenant-entitlement.policy';
export * from './auth/sql-tenant-entitlement.fallback';

export * from './authorization/constants';
export * from './authorization/decorators';
export * from './authorization/default-policy-evaluator';
export * from './authorization/authorization.guard';
export * from './authorization/authorization.module';

export * from './audit/constants';
export * from './audit/decorators';
export * from './audit/audit.interceptor';
export * from './audit/audit.module';
export * from './audit/redaction-policy';

export * from './db-context/constants';
export * from './db-context/request-db-client-lifecycle';
export * from './db-context/tenant-lifecycle.middleware';
export * from './db-context/pg-session-db-context.applier';
export * from './db-context/db-context.interceptor';
export * from './db-context/db-context.module';

export * from './storage/constants';
export * from './storage/storage.module';

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
} from '@stynx/idempotency';
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
} from '@stynx/idempotency';

/**
 * Rate-limit injection tokens and route metadata helpers.
 */
export {
  STYNX_RATE_LIMIT_METRICS,
  STYNX_RATE_LIMIT_OPTIONS,
  STYNX_RATE_LIMIT_POLICY,
  STYNX_RATE_LIMIT_ROUTE,
  STYNX_RATE_LIMIT_STORE,
} from '@stynx/ratelimit';
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
} from '@stynx/ratelimit';

export * from './sla/constants';
export * from './sla/types';
export * from './sla/default-sla-category.resolver';
export * from './sla/logger-sla-event.sink';
export * from './sla/sla-monitor.interceptor';
export * from './sla/sla.module';

export * from './pipeline/platform-pipeline.module';

export * from './identity-admin/constants';
export * from './identity-admin/identity-admin.module';
export * from './identity-admin/identity-admin.service';
export * from './identity-admin/integration-facades';
export * from './identity-admin/pg-local-sync.adapter';
