import type { Transaction } from '@stynx-nyx/data';
import {
  TransactionalIdempotencyStore,
  TransactionalReservationTimeoutError,
  type TransactionalIdempotencyIdentity,
} from '../../src/transactional-idempotency.store';

const identity: TransactionalIdempotencyIdentity = {
  tenantId: '0197481e-6f84-77e4-8d6d-41f0b6fca9c1',
  scope: 'POST:/items',
  key: 'key-1',
  fingerprint: 'request-hash',
  ttlMs: 1250,
  lockTimeoutMs: 500,
};

function scriptedTransaction(...steps: Array<{ rows?: unknown[]; rowCount?: number | null } | Error>) {
  const pending = [...steps];
  const query = vi.fn(async () => {
    const next = pending.shift();
    if (next instanceof Error) throw next;
    if (next === undefined) throw new Error('Unexpected transaction query');
    return { rows: next.rows ?? [], rowCount: next.rowCount ?? 0 };
  });
  return { trx: { query } as unknown as Transaction, query };
}

describe('TransactionalIdempotencyStore', () => {
  const store = new TransactionalIdempotencyStore();

  it('encodes scope and key lengths so delimiter-bearing values cannot collide', () => {
    expect(TransactionalIdempotencyStore.durableKey('a:b', 'c')).toBe('3:a:b:1:c');
    expect(TransactionalIdempotencyStore.durableKey('a', 'b:c')).toBe('1:a:3:b:c');
  });

  it('returns no replay when the live transaction finds no durable row', async () => {
    const { trx, query } = scriptedTransaction({ rows: [] });
    await expect(store.lookup(trx, identity)).resolves.toBe(null);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('expires_at > clock_timestamp()'), [
      identity.tenantId, TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
    ]);
  });

  it('maps pending and completed rows, including nullable stored fields', async () => {
    const bytes = Buffer.from('response');
    const { trx } = scriptedTransaction(
      { rows: [{ request_fingerprint: null, status: 'pending', response_status: null, response_bytes: null, response_headers: null }] },
      { rows: [{ request_fingerprint: identity.fingerprint, status: 'completed', response_status: 201, response_bytes: bytes, response_headers: { etag: 'v1' } }] },
    );
    await expect(store.lookup(trx, identity)).resolves.toEqual({
      fingerprint: '', status: 'pending', statusCode: null, bytes: null, headers: {},
    });
    await expect(store.lookup(trx, identity)).resolves.toEqual({
      fingerprint: identity.fingerprint, status: 'completed', statusCode: 201,
      bytes, headers: { etag: 'v1' },
    });
  });

  it('reserves with a bounded lock timeout and restores the prior timeout', async () => {
    const { trx, query } = scriptedTransaction(
      { rows: [{ timeout: '3s' }] }, {}, { rows: [{ id: 'reservation-1' }] }, {},
    );
    await expect(store.reserve(trx, identity)).resolves.toBe(true);
    expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("set_config('lock_timeout'"), ['500ms']);
    expect(query).toHaveBeenNthCalledWith(3, expect.stringContaining('insert into core.idempotency_keys'), [
      identity.tenantId,
      TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      identity.fingerprint,
      '2 seconds',
    ]);
    expect(query).toHaveBeenNthCalledWith(4, expect.stringContaining("set_config('lock_timeout'"), ['3s']);
  });

  it('returns false when another committed reservation owns the key and defaults the timeout', async () => {
    const { trx, query } = scriptedTransaction({ rows: [] }, {}, { rows: [] }, {});
    await expect(store.reserve(trx, { ...identity, ttlMs: 0 })).resolves.toBe(false);
    expect(query).toHaveBeenNthCalledWith(3, expect.any(String), expect.arrayContaining(['1 seconds']));
    expect(query).toHaveBeenNthCalledWith(4, expect.any(String), ['0']);
  });

  it('maps only reservation lock errors and leaves aborted transactions for caller rollback', async () => {
    const lockError = Object.assign(new Error('lock unavailable'), { code: '55P03' });
    const locked = scriptedTransaction({ rows: [{ timeout: '0' }] }, {}, lockError);
    await expect(store.reserve(locked.trx, identity)).rejects.toBeInstanceOf(TransactionalReservationTimeoutError);
    expect(locked.query).toHaveBeenCalledTimes(3);

    const sqlError = Object.assign(new Error('database unavailable'), { code: '08006' });
    const failed = scriptedTransaction({ rows: [{ timeout: '0' }] }, {}, sqlError);
    await expect(store.reserve(failed.trx, identity)).rejects.toBe(sqlError);
    expect(failed.query).toHaveBeenCalledTimes(3);
  });

  it('completes only the matching pending reservation and refuses a lost reservation', async () => {
    const bytes = Buffer.from('response');
    const completed = scriptedTransaction({ rowCount: 1 });
    await expect(store.complete(completed.trx, identity, 202, bytes, { etag: 'v2' })).resolves.toBeUndefined();
    expect(completed.query).toHaveBeenCalledWith(expect.stringContaining("status = 'pending'"), [
      identity.tenantId, TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      202, bytes, '{"etag":"v2"}', identity.fingerprint,
    ]);

    const lost = scriptedTransaction({ rowCount: 0 });
    await expect(store.complete(lost.trx, identity, 202, null, {}))
      .rejects.toThrow('Transactional idempotency reservation was lost');
  });

  it('clears only the matching pending reservation inside the supplied transaction', async () => {
    const { trx, query } = scriptedTransaction({ rowCount: 1 });
    await expect(store.clear(trx, identity)).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.stringContaining('delete from core.idempotency_keys'), [
      identity.tenantId, TransactionalIdempotencyStore.durableKey(identity.scope, identity.key),
      identity.fingerprint,
    ]);
  });
});
