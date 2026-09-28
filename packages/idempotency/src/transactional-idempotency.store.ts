import { Injectable } from '@nestjs/common';
import type { Transaction } from '@stynx-nyx/data';

export interface TransactionalIdempotencyIdentity {
  tenantId: string;
  scope: string;
  key: string;
  fingerprint: string;
  ttlMs: number;
  lockTimeoutMs: number;
}

export interface TransactionalStoredResponse {
  fingerprint: string;
  status: 'pending' | 'completed';
  statusCode: number | null;
  bytes: Buffer | null;
  headers: Record<string, string>;
}

interface CommandRow {
  request_fingerprint: string | null;
  status: 'pending' | 'completed';
  response_status: number | null;
  response_bytes: Buffer | null;
  response_headers: Record<string, string> | null;
}

/** A wait timeout caused specifically by the durable reservation statement. */
export class TransactionalReservationTimeoutError extends Error {
  constructor() { super('Transactional idempotency reservation timed out'); }
}

/** Every operation uses the caller's live app-role transaction. */
@Injectable()
export class TransactionalIdempotencyStore {
  static durableKey(scope: string, key: string): string {
    return `${scope.length}:${scope}:${key.length}:${key}`;
  }

  async lookup(trx: Transaction, identity: TransactionalIdempotencyIdentity): Promise<TransactionalStoredResponse | null> {
    const result = await trx.query<CommandRow>(`
      select request_fingerprint, status, response_status, response_bytes, response_headers
        from core.idempotency_keys
       where tenant_id = $1::uuid and key = $2
         and expires_at > clock_timestamp()
       limit 1`, [identity.tenantId, TransactionalIdempotencyStore.durableKey(identity.scope, identity.key)]);
    const row = result.rows[0];
    return row ? {
      fingerprint: row.request_fingerprint ?? '',
      status: row.status,
      statusCode: row.response_status,
      bytes: row.response_bytes,
      headers: row.response_headers ?? {},
    } : null;
  }

  /** Returns false only after the winner has committed and owns the key. */
  async reserve(trx: Transaction, identity: TransactionalIdempotencyIdentity): Promise<boolean> {
    const original = await trx.query<{ timeout: string }>("select current_setting('lock_timeout', true) as timeout");
    await trx.query("select set_config('lock_timeout', $1, true)", [`${identity.lockTimeoutMs}ms`]);
    // A 55P03 aborts this transaction; the caller must roll back before mapping it.
    let result: Awaited<ReturnType<typeof trx.query<{ id: string }>>>;
    try {
      result = await trx.query<{ id: string }>(`
      insert into core.idempotency_keys
        (tenant_id, key, status, request_fingerprint, expires_at, updated_at)
      values ($1::uuid, $2, 'pending', $3, clock_timestamp() + $4::interval, clock_timestamp())
      on conflict (tenant_id, key) do update
        set status = 'pending', request_fingerprint = excluded.request_fingerprint,
            response = null, response_status = null, response_bytes = null,
            response_headers = null, expires_at = excluded.expires_at,
            updated_at = clock_timestamp()
        where core.idempotency_keys.expires_at <= clock_timestamp()
      returning id`, [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      identity.fingerprint,
      `${Math.max(1, Math.ceil(identity.ttlMs / 1000))} seconds`,
      ]);
    } catch (error) {
      if ((error as { code?: string })?.code === '55P03') throw new TransactionalReservationTimeoutError();
      throw error;
    }
    await trx.query("select set_config('lock_timeout', $1, true)", [original.rows[0]?.timeout ?? '0']);
    return result.rows.length > 0;
  }

  async complete(
    trx: Transaction,
    identity: TransactionalIdempotencyIdentity,
    statusCode: number,
    bytes: Buffer | null,
    headers: Record<string, string>,
  ): Promise<void> {
    const result = await trx.query(`
      update core.idempotency_keys
         set status = 'completed', response_status = $3, response_bytes = $4,
             response_headers = $5::jsonb, updated_at = clock_timestamp()
       where tenant_id = $1::uuid and key = $2
         and status = 'pending' and request_fingerprint = $6`, [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      statusCode,
      bytes,
      JSON.stringify(headers),
      identity.fingerprint,
    ]);
    if (result.rowCount !== 1) throw new Error('Transactional idempotency reservation was lost');
  }

  async clear(trx: Transaction, identity: TransactionalIdempotencyIdentity): Promise<void> {
    await trx.query(`
      delete from core.idempotency_keys
       where tenant_id = $1::uuid and key = $2
         and status = 'pending' and request_fingerprint = $3`, [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      identity.fingerprint,
    ]);
  }
}
