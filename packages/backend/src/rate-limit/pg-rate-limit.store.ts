import { executeConfiguredQuery } from '@stynx-nyx/data';
import type {
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

/**
 * SQL-backed distributed rate-limit window store modeled after PEC
 * `integration.rate_limit_windows`.
 */
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

  async increment(context: RateLimitDecisionContext): Promise<number | null> {
    if (!context.tenantId) return null;

    const now = Date.now();
    const windowStartMs = Math.floor(now / context.ttlMs) * context.ttlMs;
    const expiresAtMs = windowStartMs + context.ttlMs * 2;
    const result = await executeConfiguredQuery(this.options.executor, 'ratelimit.increment', { table: this.table, tenantColumn: this.tenantColumn, bucketColumn: this.bucketColumn, windowStartColumn: this.windowStartColumn, hitsColumn: this.hitsColumn, expiresAtColumn: this.expiresAtColumn },
      [
        context.tenantId,
        context.bucketKey,
        new Date(windowStartMs).toISOString(),
        new Date(expiresAtMs).toISOString(),
      ],
    );
    const rows = result.rows;
    return rows[0]?.hitCount ?? null;
  }

  async cleanup(context: RateLimitDecisionContext): Promise<void> {
    if (!context.tenantId) return;
    await executeConfiguredQuery(this.options.executor, 'ratelimit.cleanup', { table: this.table, tenantColumn: this.tenantColumn, bucketColumn: this.bucketColumn, windowStartColumn: this.windowStartColumn, hitsColumn: this.hitsColumn, expiresAtColumn: this.expiresAtColumn },
      [context.tenantId],
    );
  }
}
