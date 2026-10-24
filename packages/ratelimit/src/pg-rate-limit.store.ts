import { executeConfiguredQuery } from '@stynx-nyx/data';
import type {
  RateLimitDecision,
  RateLimitDecisionContext,
  RateLimitSqlExecutor,
  RateLimitStore,
} from './types.js';

function assertIdentifierPath(value: string, name: string): string {
  const parts = value.split('.');
  const valid = parts.every((part) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(part));
  if (!valid) {
    throw new Error(`Invalid SQL identifier for ${name}: ${value}`);
  }
  return value;
}

export interface PgRateLimitStoreOptions {
  executor: RateLimitSqlExecutor;
  table?: string;
  tenantColumn?: string;
  bucketColumn?: string;
  windowStartColumn?: string;
  hitsColumn?: string;
  expiresAtColumn?: string;
}

export class PgRateLimitStore implements RateLimitStore {
  private readonly table: string;
  private readonly tenantColumn: string;
  private readonly bucketColumn: string;
  private readonly windowStartColumn: string;
  private readonly hitsColumn: string;
  private readonly expiresAtColumn: string;

  constructor(private readonly options: PgRateLimitStoreOptions) {
    this.table = assertIdentifierPath(
      options.table ?? 'integration.rate_limit_windows',
      'table',
    );
    this.tenantColumn = assertIdentifierPath(
      options.tenantColumn ?? 'tenant_id',
      'tenantColumn',
    );
    this.bucketColumn = assertIdentifierPath(
      options.bucketColumn ?? 'bucket_key',
      'bucketColumn',
    );
    this.windowStartColumn = assertIdentifierPath(
      options.windowStartColumn ?? 'window_start',
      'windowStartColumn',
    );
    this.hitsColumn = assertIdentifierPath(options.hitsColumn ?? 'hits', 'hitsColumn');
    this.expiresAtColumn = assertIdentifierPath(
      options.expiresAtColumn ?? 'expires_at',
      'expiresAtColumn',
    );
  }

  async consume(context: RateLimitDecisionContext): Promise<RateLimitDecision> {
    if (!context.tenantId) {
      return {
        allowed: true,
        limit: context.limit,
        remaining: Math.max(context.limit - context.cost, 0),
        resetAtEpochMs: Date.now() + context.ttlMs,
        retryAfterSeconds: Math.max(1, Math.ceil(context.ttlMs / 1000)),
        used: context.cost,
      };
    }

    const now = Date.now();
    const windowStartMs = Math.floor(now / context.ttlMs) * context.ttlMs;
    const expiresAtMs = windowStartMs + context.ttlMs * 2;
    const result = await executeConfiguredQuery(this.options.executor, 'ratelimit.consume', { table: this.table, tenantColumn: this.tenantColumn, bucketColumn: this.bucketColumn, windowStartColumn: this.windowStartColumn, hitsColumn: this.hitsColumn, expiresAtColumn: this.expiresAtColumn },
      [
        context.tenantId,
        context.bucketKey,
        new Date(windowStartMs).toISOString(),
        context.cost,
        new Date(expiresAtMs).toISOString(),
      ],
    );
    const rows = result.rows;
    const used = rows[0]?.hitCount ?? context.cost;
    const resetAtEpochMs = windowStartMs + context.ttlMs;
    return {
      allowed: used <= context.limit,
      limit: context.limit,
      remaining: Math.max(context.limit - used, 0),
      resetAtEpochMs,
      retryAfterSeconds: Math.max(1, Math.ceil((resetAtEpochMs - now) / 1000)),
      used,
    };
  }
}
