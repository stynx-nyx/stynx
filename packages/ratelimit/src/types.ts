import type { RequestLike } from './request-context';

export type RateLimitBucket = 'ip' | 'tenant' | 'user' | 'route';

export interface RateLimitMetadata {
  bucket: RateLimitBucket;
  scope: string;
  cost?: number;
  limit?: number;
  windowSeconds?: number;
}

export interface ResolvedRateLimitPolicy extends RateLimitMetadata {
  cost: number;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitDecisionContext {
  request: RequestLike;
  bucketKey: string;
  tenantId?: string;
  userId?: string;
  ttlMs: number;
  scope: string;
  cost: number;
  limit: number;
  bucket: RateLimitBucket;
}

export interface RateLimitDecision {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAtEpochMs: number;
  retryAfterSeconds: number;
  used: number;
}

export interface RateLimitStore {
  consume(context: RateLimitDecisionContext): Promise<RateLimitDecision>;
}

export interface RateLimitGuardOptions {
  defaultLimit?: number;
  defaultWindowSeconds?: number;
  distributedStrict?: boolean;
  healthCheckPathPrefixes?: string[];
  redis?: {
    url: string;
    keyPrefix?: string;
  };
  defaults?: Record<string, { limit: number; windowSeconds: number }>;
}

export interface RateLimitMetricsSink {
  incrementBlocked(scope: string): void;
}

export interface RateLimitPolicyResolver {
  resolve(request: RequestLike, metadata: RateLimitMetadata): Promise<ResolvedRateLimitPolicy>;
}

export interface RateLimitSqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number } | T[]>;
}
