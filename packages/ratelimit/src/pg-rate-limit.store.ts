import type {
  RateLimitDecision,
  RateLimitDecisionContext,
  RateLimitSqlExecutor,
  RateLimitStore,
} from './types';

function toRows<T>(result: { rows: T[] } | T[]): T[] {
  return Array.isArray(result) ? result : result.rows;
}

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
    const result = await this.options.executor.query<{ hitCount: number }>(
      `INSERT INTO ${this.table} (
         ${this.tenantColumn},
         ${this.bucketColumn},
         ${this.windowStartColumn},
         ${this.hitsColumn},
         ${this.expiresAtColumn}
       )
       VALUES (
         $1::uuid,
         $2,
         $3::timestamptz,
         $4::int,
         $5::timestamptz
       )
       ON CONFLICT (${this.tenantColumn}, ${this.bucketColumn}, ${this.windowStartColumn})
       DO UPDATE
         SET ${this.hitsColumn} = ${this.table}.${this.hitsColumn} + EXCLUDED.${this.hitsColumn},
             ${this.expiresAtColumn} = EXCLUDED.${this.expiresAtColumn}
       RETURNING ${this.hitsColumn} AS "hitCount"`,
      [
        context.tenantId,
        context.bucketKey,
        new Date(windowStartMs).toISOString(),
        context.cost,
        new Date(expiresAtMs).toISOString(),
      ],
    );
    const rows = toRows(result);
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
