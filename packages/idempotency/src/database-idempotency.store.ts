import { Inject, Injectable, Optional } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { STYNX_IDEMPOTENCY_OPTIONS } from './constants';
import type {
  IdempotencyDecisionContext,
  IdempotencyInterceptorOptions,
  IdempotencyStoredEntry,
  IdempotencyStore,
} from './types';

interface DurableRow {
  request_fingerprint: string | null;
  response: {
    body?: unknown;
    statusCode?: number;
  } | null;
  response_headers: Record<string, string> | null;
  status: 'pending' | 'completed';
  expires_at: string | null;
}

function stringifyIdempotencyValue(value: unknown): string {
  return JSON.stringify(value, (_key, current) => (typeof current === 'bigint' ? current.toString() : current));
}

@Injectable()
export class DatabaseIdempotencyStore implements IdempotencyStore {
  constructor(
    @Optional()
    private readonly database?: Database,
    @Inject(STYNX_IDEMPOTENCY_OPTIONS)
    private readonly options?: IdempotencyInterceptorOptions,
  ) {}

  async lookup(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null> {
    if (!this.database) {
      return null;
    }
    const database = this.database;
    return database.withSystemContext('idempotency lookup', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<DurableRow>(
            `
              select request_fingerprint, response, response_headers, status, expires_at
              from core.idempotency_keys
              where tenant_id is not distinct from $1::uuid
                and key = $2
                and coalesce(expires_at, clock_timestamp() + interval '1 second') > clock_timestamp()
              limit 1
            `,
            [context.tenantId ?? null, context.compositeKey],
          );
          const row = result.rows[0];
          if (!row) {
            return null;
          }
          return {
            requestFingerprint: row.request_fingerprint ?? '',
            statusCode: row.response?.statusCode ?? null,
            body: row.response?.body ?? null,
            headers: row.response_headers ?? {},
            expiresAt: row.expires_at ? Date.parse(row.expires_at) : Date.now() + (context.ttlMs ?? this.options?.ttlMs ?? 86_400_000),
            status: row.status,
          };
        },
        { role: 'owner', readonly: true, replica: false },
      ),
    );
  }

  async reserve(context: IdempotencyDecisionContext): Promise<boolean> {
    if (!this.database) {
      return false;
    }
    const database = this.database;
    return database.withSystemContext('idempotency reserve', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query<{ reserved: number }>(
            `
              insert into core.idempotency_keys (
                tenant_id,
                key,
                status,
                request_fingerprint,
                expires_at,
                updated_at
              )
              values ($1::uuid, $2, 'pending', $3, clock_timestamp() + make_interval(secs => $4::int), clock_timestamp())
              on conflict (tenant_id, key) do nothing
              returning 1 as reserved
            `,
            [context.tenantId ?? null, context.compositeKey, context.requestFingerprint, Math.max(1, Math.floor(context.ttlMs / 1000))],
          );
          return Boolean(result.rows[0]?.reserved);
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );
  }

  async persistResponse(
    context: IdempotencyDecisionContext,
    statusCode: number,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<boolean> {
    if (!this.database) {
      return false;
    }
    const database = this.database;
    return database.withSystemContext('idempotency persist', async () =>
      database.tx(
        async (trx) => {
          const result = await trx.query(
            `
              update core.idempotency_keys
                 set status = 'completed',
                     response = $3::jsonb,
                     response_headers = $4::jsonb,
                     expires_at = clock_timestamp() + make_interval(secs => $5::int),
                     updated_at = clock_timestamp()
               where tenant_id is not distinct from $1::uuid
                 and key = $2
            `,
            [
              context.tenantId ?? null,
              context.compositeKey,
              stringifyIdempotencyValue({ statusCode, body }),
              stringifyIdempotencyValue(headers),
              Math.max(1, Math.floor(context.ttlMs / 1000)),
            ],
          );
          return (result.rowCount ?? 0) > 0;
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );
  }

  async clearReservation(context: IdempotencyDecisionContext): Promise<void> {
    if (!this.database) {
      return;
    }
    const database = this.database;
    await database.withSystemContext('idempotency clear reservation', async () =>
      database.tx(
        async (trx) => {
          await trx.query(
            `
              delete from core.idempotency_keys
              where tenant_id is not distinct from $1::uuid
                and key = $2
                and status = 'pending'
            `,
            [context.tenantId ?? null, context.compositeKey],
          );
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );
  }
}
