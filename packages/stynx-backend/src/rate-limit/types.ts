import type { RequestLike } from '../common/request-context';

export interface RateLimitDecisionContext {
  request: RequestLike;
  bucketKey: string;
  tenantId?: string;
  ttlMs: number;
}

export interface RateLimitStore {
  increment(context: RateLimitDecisionContext): Promise<number | null>;
  cleanup?(context: RateLimitDecisionContext): Promise<void>;
}

export interface RateLimitGuardOptions {
  limit?: number;
  ttlSeconds?: number;
  distributedStrict?: boolean;
  healthCheckPathPrefixes?: string[];
  maxBuckets?: number;
  cleanupEvery?: number;
}

export interface RateLimitSqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number } | T[]>;
}
