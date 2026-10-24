import { completeCommand, lookupCommand, reserveCommand, clearCommand, readLockTimeout, setLockTimeout } from './idempotency.repository.js';
import { Injectable } from '@nestjs/common';
import { executeTypedCommand, executeTypedQuery, type ResultOf, type Transaction } from '@stynx-nyx/data';

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
    const result = await executeTypedQuery(trx, lookupCommand, [identity.tenantId, TransactionalIdempotencyStore.durableKey(identity.scope, identity.key)]);
    const row = result;
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
    const original = await executeTypedQuery(trx, readLockTimeout, []);
    await executeTypedQuery(trx, setLockTimeout, [`${identity.lockTimeoutMs}ms`]);
    // A 55P03 aborts this transaction; the caller must roll back before mapping it.
    let result: ResultOf<typeof reserveCommand>;
    try {
      result = await executeTypedQuery(trx, reserveCommand, [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      identity.fingerprint,
      `${Math.max(1, Math.ceil(identity.ttlMs / 1000))} seconds`,
      ]);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03') throw new TransactionalReservationTimeoutError();
      throw error;
    }
    await executeTypedQuery(trx, setLockTimeout, [original?.timeout ?? '0']);
    return result !== null;
  }

  async complete(
    trx: Transaction,
    identity: TransactionalIdempotencyIdentity,
    statusCode: number,
    bytes: Buffer | null,
    headers: Record<string, string>,
  ): Promise<void> {
    const result = await executeTypedCommand(trx, completeCommand, [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      statusCode,
      bytes,
      JSON.stringify(headers),
      identity.fingerprint,
    ]);
    if (result !== 1) throw new Error('Transactional idempotency reservation was lost');
  }

  async clear(trx: Transaction, identity: TransactionalIdempotencyIdentity): Promise<void> {
    await executeTypedQuery(trx, clearCommand, [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      identity.fingerprint,
    ]);
  }
}
