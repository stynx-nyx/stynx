import { completeDurable, lookupDurable, reserveDurable, clearDurable } from './idempotency.repository.js';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { Database, executeTypedCommand, executeTypedQuery } from '@stynx-nyx/data';
import { STYNX_IDEMPOTENCY_OPTIONS } from './constants.js';
import type {
  IdempotencyDecisionContext,
  IdempotencyInterceptorOptions,
  IdempotencyStoredEntry,
  IdempotencyStore,
} from './types.js';


function stringifyIdempotencyValue(value: unknown): string {
  return JSON.stringify(value, (_key: string, current: unknown) => (typeof current === 'bigint' ? current.toString() : current));
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
          const result = await executeTypedQuery(trx, lookupDurable,
            [context.tenantId ?? null, context.compositeKey],
          );
          const row = result;
          if (!row) {
            return null;
          }
          return {
            requestFingerprint: row.request_fingerprint ?? '',
            statusCode: row.response?.statusCode ?? null,
            body: row.response?.body ?? null,
            headers: row.response_headers ?? {},
            expiresAt: row.expires_at ? Date.parse(String(row.expires_at)) : Date.now() + (context.ttlMs ?? this.options?.ttlMs ?? 86_400_000),
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
          const result = await executeTypedQuery(trx, reserveDurable,
            [context.tenantId ?? null, context.compositeKey, context.requestFingerprint, Math.max(1, Math.floor(context.ttlMs / 1000))],
          );
          return Boolean(result?.reserved);
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
          const result = await executeTypedCommand(trx, completeDurable,
            [
              context.tenantId ?? null,
              context.compositeKey,
              stringifyIdempotencyValue({ statusCode, body }),
              stringifyIdempotencyValue(headers),
              Math.max(1, Math.floor(context.ttlMs / 1000)),
            ],
          );
          return (result ?? 0) > 0;
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
          await executeTypedQuery(trx, clearDurable,
            [context.tenantId ?? null, context.compositeKey],
          );
        },
        { role: 'owner', readonly: false, replica: false },
      ),
    );
  }
}
