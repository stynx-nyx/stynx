import type { RequestLike } from '../common/request-context';

export interface IdempotencyDecisionContext {
  request: RequestLike;
  idempotencyKey: string;
  requestFingerprint: string;
  tenantId?: string;
  ttlMs: number;
}

export interface IdempotencyStoredEntry {
  requestFingerprint: string;
  statusCode: number | null;
  body: unknown;
  expiresAt: number;
}

export interface IdempotencyStore {
  lookup(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null>;
  reserve(context: IdempotencyDecisionContext): Promise<boolean>;
  persistResponse(
    context: IdempotencyDecisionContext,
    statusCode: number,
    body: unknown,
  ): Promise<boolean>;
  clearReservation(context: IdempotencyDecisionContext): Promise<void>;
}

export type IdempotencyKeyRequirement =
  | boolean
  | ((request: RequestLike) => boolean);

export interface IdempotencyInterceptorOptions {
  keyHeaderName?: string;
  replayKeyHeaderName?: string;
  replayMarkerHeaderName?: string;
  writeMethods?: ReadonlyArray<string>;
  ttlMs?: number;
  cacheCleanupMs?: number;
  requireKeyOnWrite?: IdempotencyKeyRequirement;
  durableStrict?: boolean;
  waitAttempts?: number;
  waitIntervalMs?: number;
}

export interface IdempotencySqlExecutor {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: ReadonlyArray<unknown>,
  ): Promise<{ rows: T[]; rowCount?: number } | T[]>;
}
