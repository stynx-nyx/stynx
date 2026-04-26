import type {
  IdempotencyDecisionContext,
  IdempotencySqlExecutor,
  IdempotencyStoredEntry,
  IdempotencyStore,
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

export interface PgIdempotencyStoreOptions {
  executor: IdempotencySqlExecutor;
  table?: string;
  tenantColumn?: string;
  keyColumn?: string;
  fingerprintColumn?: string;
  statusCodeColumn?: string;
  bodyColumn?: string;
  expiresAtColumn?: string;
}

export class PgIdempotencyStore implements IdempotencyStore {
  private readonly table: string;
  private readonly tenantColumn: string;
  private readonly keyColumn: string;
  private readonly fingerprintColumn: string;
  private readonly statusCodeColumn: string;
  private readonly bodyColumn: string;
  private readonly expiresAtColumn: string;

  constructor(private readonly options: PgIdempotencyStoreOptions) {
    this.table = assertIdentifierPath(
      options.table ?? 'integration.idempotency_keys',
      'table',
    );
    this.tenantColumn = assertIdentifierPath(
      options.tenantColumn ?? 'tenant_id',
      'tenantColumn',
    );
    this.keyColumn = assertIdentifierPath(options.keyColumn ?? 'idem_key', 'keyColumn');
    this.fingerprintColumn = assertIdentifierPath(
      options.fingerprintColumn ?? 'request_fingerprint',
      'fingerprintColumn',
    );
    this.statusCodeColumn = assertIdentifierPath(
      options.statusCodeColumn ?? 'status_code',
      'statusCodeColumn',
    );
    this.bodyColumn = assertIdentifierPath(options.bodyColumn ?? 'response_body', 'bodyColumn');
    this.expiresAtColumn = assertIdentifierPath(
      options.expiresAtColumn ?? 'expires_at',
      'expiresAtColumn',
    );
  }

  async lookup(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null> {
    if (!context.tenantId) return null;

    const result = await this.options.executor.query<{
      requestFingerprint: string;
      statusCode: number | null;
      responseBody: unknown;
      expiresAt: string;
    }>(
      `SELECT ${this.fingerprintColumn} AS "requestFingerprint",
              ${this.statusCodeColumn} AS "statusCode",
              ${this.bodyColumn} AS "responseBody",
              ${this.expiresAtColumn} AS "expiresAt"
         FROM ${this.table}
        WHERE ${this.tenantColumn}::text = $1
          AND ${this.keyColumn} = $2
          AND ${this.expiresAtColumn} > now()
        LIMIT 1`,
      [context.tenantId, context.compositeKey],
    );
    const rows = toRows(result);
    if (rows.length === 0) return null;
    const row = rows[0];
    if (!row) return null;
    const body =
      row.statusCode === null || row.statusCode === undefined ? null : row.responseBody;
    return {
      requestFingerprint: row.requestFingerprint,
      statusCode: row.statusCode ?? 200,
      body,
      headers: {},
      expiresAt: Date.parse(row.expiresAt),
      status: row.statusCode === null || row.statusCode === undefined ? 'pending' : 'completed',
    };
  }

  async reserve(context: IdempotencyDecisionContext): Promise<boolean> {
    if (!context.tenantId) return false;
    const ttlSeconds = Math.max(1, Math.floor(context.ttlMs / 1000));
    const result = await this.options.executor.query<{ reserved: number }>(
      `INSERT INTO ${this.table} (
         id,
         ${this.tenantColumn},
         ${this.keyColumn},
         ${this.fingerprintColumn},
         ${this.statusCodeColumn},
         ${this.bodyColumn},
         ${this.expiresAtColumn}
       )
       VALUES (
         gen_random_uuid(),
         $1::uuid,
         $2,
         $3,
         NULL,
         NULL,
         now() + make_interval(secs => $4::int)
       )
       ON CONFLICT (${this.tenantColumn}, ${this.keyColumn}) DO NOTHING
       RETURNING 1 AS reserved`,
      [
        context.tenantId,
        context.compositeKey,
        context.requestFingerprint,
        ttlSeconds,
      ],
    );
    const rows = toRows(result);
    return rows.length > 0;
  }

  async persistResponse(
    context: IdempotencyDecisionContext,
    statusCode: number,
    body: unknown,
    _headers: Record<string, string> = {},
  ): Promise<boolean> {
    if (!context.tenantId) return false;
    const ttlSeconds = Math.max(1, Math.floor(context.ttlMs / 1000));
    const responseBody = body === undefined ? null : body;
    const result = await this.options.executor.query(
      `UPDATE ${this.table}
          SET ${this.statusCodeColumn} = $4,
              ${this.bodyColumn} = $5::jsonb,
              ${this.expiresAtColumn} = now() + make_interval(secs => $6::int)
        WHERE ${this.tenantColumn}::text = $1
          AND ${this.keyColumn} = $2
          AND ${this.fingerprintColumn} = $3`,
      [
        context.tenantId,
        context.compositeKey,
        context.requestFingerprint,
        statusCode,
        JSON.stringify(responseBody),
        ttlSeconds,
      ],
    );
    const rowCount = Array.isArray(result) ? result.length : (result.rowCount ?? 0);
    return rowCount > 0;
  }

  async clearReservation(context: IdempotencyDecisionContext): Promise<void> {
    if (!context.tenantId) return;
    await this.options.executor.query(
      `DELETE FROM ${this.table}
        WHERE ${this.tenantColumn}::text = $1
          AND ${this.keyColumn} = $2
          AND ${this.fingerprintColumn} = $3
          AND ${this.bodyColumn} IS NULL`,
      [context.tenantId, context.compositeKey, context.requestFingerprint],
    );
  }
}
