import type { RequestLike } from './request-context';

export interface IdempotentMetadata {
  headerName?: string;
  ttlMs?: number;
}

export interface IdempotencyDecisionContext {
  request: RequestLike;
  compositeKey: string;
  headerName: string;
  headerValue: string;
  requestFingerprint: string;
  tenantId?: string;
  userId?: string;
  routeKey: string;
  ttlMs: number;
}

export interface IdempotencyStoredEntry {
  requestFingerprint: string;
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
  expiresAt: number;
  status: 'pending' | 'completed';
}

export interface IdempotencyStore {
  lookup(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null>;
  reserve(context: IdempotencyDecisionContext): Promise<boolean>;
  persistResponse(
    context: IdempotencyDecisionContext,
    statusCode: number,
    body: unknown,
    headers?: Record<string, string>,
  ): Promise<boolean>;
  clearReservation(context: IdempotencyDecisionContext): Promise<void>;
}

export interface IdempotencyBackend {
  get(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null>;
  set(context: IdempotencyDecisionContext, entry: IdempotencyStoredEntry): Promise<void>;
  acquireLock(context: IdempotencyDecisionContext, token: string): Promise<boolean>;
  releaseLock(context: IdempotencyDecisionContext, token: string): Promise<void>;
  isLocked(context: IdempotencyDecisionContext): Promise<boolean>;
}

export interface IdempotencyInterceptorOptions {
  defaultHeaderName?: string;
  replayKeyHeaderName?: string;
  replayMarkerHeaderName?: string;
  ttlMs?: number;
  redis?: {
    url: string;
    keyPrefix?: string;
  };
  durableStrict?: boolean;
  waitAttempts?: number;
  waitIntervalMs?: number;
}

export interface IdempotencyMetricsSink {
  incrementReplay(): void;
}

export interface IdempotencySqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number } | T[]>;
}
