import { describe, expect, it, vi } from 'vitest';
import type { Database } from '@stynx-nyx/data';
import { OfflineSyncReservationReplayError } from '../../src/errors';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { decodeCursor, encodeCursor, reservationFingerprint } from '../../src/listing';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { PostgresOfflineSyncStore } from '../../src/postgres-offline-sync.store';
import { pgListBatches, pgListConflicts, pgListItemReceipts, pgListQueueItems } from '../../src/postgres-listing';
import type { OfflineSyncPolicy, OfflineSyncStore, StynxOfflineSyncModuleOptions } from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-05, UPS-OFS-11 (#317, PR #330 review): keyed replay precedes time and
// policy checks, replay returns the current state, forged cursors are 400, validUntil is normalized.
const tenant = '00000000-0000-4000-8000-0000000000a7';
const scope = { tenantId: tenant, actorId: 'actor-a' };
const reserve = { orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'citation', requestedSize: 2 };

function harness(options: Partial<StynxOfflineSyncModuleOptions> = {}) {
  const store = new InMemoryOfflineSyncStore();
  store.seedNumberingRange({ id: '10000000-0000-4000-8000-0000000000a7', tenantId: tenant, orgUnitId: 'org-a',
    entityType: 'citation', series: 'C', startNumber: 1, endNumber: 50, nextNumber: 1, status: 'active' });
  let clock = '2026-09-28T12:00:00.000Z';
  let policy: OfflineSyncPolicy = { reservationTtlMs: 3_600_000 };
  const policyResolver = { resolve: vi.fn(async () => policy) };
  const agentResolver = { resolve: vi.fn(async () => 'agent-a') };
  const service = new OfflineSyncService(store, { current: () => scope }, { now: () => clock, policyResolver, agentResolver, ...options } as StynxOfflineSyncModuleOptions);
  return { store, service, policyResolver, agentResolver, at: (value: string) => { clock = value; }, setPolicy: (value: OfflineSyncPolicy) => { policy = value; } };
}

describe('keyed reservation replay before time and policy checks', () => {
  it('replays after validUntil passed and after the policy lost its TTL, without resolving policy again', async () => {
    const h = harness();
    const first = await h.service.reserveNumbering({ ...reserve, validUntil: '2026-09-28T13:00:00.000Z', idempotencyKey: 'k-1' });
    expect([h.policyResolver.resolve.mock.calls.length, h.agentResolver.resolve.mock.calls.length]).toEqual([1, 1]);
    h.at('2026-09-29T12:00:00.000Z');
    h.setPolicy({});
    await expect(h.service.reserveNumbering({ ...reserve, validUntil: '2026-09-28T13:00:00.000Z', idempotencyKey: 'k-1' })).resolves.toEqual(first);
    expect([h.policyResolver.resolve.mock.calls.length, h.agentResolver.resolve.mock.calls.length]).toEqual([1, 2]);
    await expect(h.service.reserveNumbering({ ...reserve, requestedSize: 3, validUntil: '2026-09-28T13:00:00.000Z', idempotencyKey: 'k-1' }))
      .rejects.toBeInstanceOf(OfflineSyncReservationReplayError);
    await expect(h.service.reserveNumbering({ ...reserve, validUntil: '2026-09-28T13:00:00.000Z', idempotencyKey: 'k-new' }))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'reservation policy is missing.' });
    expect(h.agentResolver.resolve).toHaveBeenCalledTimes(4);
  });

  it('returns the reservation in its current state: cancelled stays cancelled, time-expired keeps its validUntil', async () => {
    const h = harness();
    const first = await h.service.reserveNumbering({ ...reserve, idempotencyKey: 'k-cancel' });
    await h.service.cancelNumberingReservation(first.reservationId);
    await expect(h.service.reserveNumbering({ ...reserve, idempotencyKey: 'k-cancel' })).resolves.toMatchObject({ reservationId: first.reservationId, status: 'cancelled' });
    const timed = await h.service.reserveNumbering({ ...reserve, idempotencyKey: 'k-time' });
    h.at('2026-10-30T00:00:00.000Z');
    await expect(h.service.reserveNumbering({ ...reserve, idempotencyKey: 'k-time' })).resolves.toEqual({ ...timed, status: 'reserved', validUntil: '2026-09-28T13:00:00.000Z' });
  });

  it('treats equal validUntil instants as the same request', async () => {
    const h = harness();
    const first = await h.service.reserveNumbering({ ...reserve, validUntil: '2026-09-30T00:00:00Z', idempotencyKey: 'k-norm' });
    await expect(h.service.reserveNumbering({ ...reserve, validUntil: '2026-09-30T00:00:00.000Z', idempotencyKey: 'k-norm' })).resolves.toEqual(first);
    expect(reservationFingerprint(scope, { ...reserve, validUntil: '2026-09-30T00:00:00Z' }))
      .toBe(reservationFingerprint(scope, { ...reserve, validUntil: '2026-09-30T03:00:00+03:00' }));
    expect(reservationFingerprint(scope, { ...reserve, validUntil: 'not-a-date' })).not.toBe(reservationFingerprint(scope, reserve));
  });

  it('replays a key when the in-memory store is called directly', async () => {
    const { store } = harness();
    const first = await store.reserveNumbering(scope, { ...reserve, idempotencyKey: 'direct' }, 'now', '2026-09-29T00:00:00.000Z');
    await expect(store.reserveNumbering(scope, { ...reserve, idempotencyKey: 'direct' }, 'later', '2026-12-01T00:00:00.000Z')).resolves.toEqual(first);
  });

  it('falls back to the store reservation path when a custom store has no replay operation', async () => {
    const reserveNumbering = vi.fn(async () => ({ reservationId: 'r' }));
    const service = new OfflineSyncService({ reserveNumbering } as unknown as OfflineSyncStore, { current: () => scope }, { now: () => '2026-09-28T12:00:00.000Z' });
    await expect(service.reserveNumbering({ ...reserve, idempotencyKey: 'custom' })).resolves.toEqual({ reservationId: 'r' });
    expect(reserveNumbering).toHaveBeenCalledWith(scope, { ...reserve, idempotencyKey: 'custom' }, '2026-09-28T12:00:00.000Z', '2026-09-29T12:00:00.000Z');
  });
});

describe('PostgreSQL keyed replay boundary', () => {
  const storeWith = (query: (sql: string, values?: unknown[]) => Promise<{ rows: unknown[] }>) => {
    const database = { tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })) } as unknown as Database;
    return new PostgresOfflineSyncStore({ get: () => database } as never);
  };
  const row = { id: 'r-1', tenant_id: tenant, range_id: 'g', org_unit_id: 'org-a', entity_type: 'citation', series: 'C', agent_id: 'actor-a', device_id: 'device-a',
    shift_id: 'shift-a', start_number: '1', end_number: '2', next_number: '1', valid_until: new Date('2026-09-28T13:00:00.000Z'), status: 'cancelled' };

  it('returns null without a key or a stored row, the current row for a match, and refuses a changed request', async () => {
    const query = vi.fn(async () => ({ rows: [] as unknown[] }));
    const store = storeWith(query);
    await expect(store.replayNumberingReservation(scope, reserve)).resolves.toBe(null);
    expect(query).not.toHaveBeenCalled();
    await expect(store.replayNumberingReservation(scope, { ...reserve, idempotencyKey: 'k' })).resolves.toBe(null);
    query.mockResolvedValue({ rows: [{ ...row, idempotency_fingerprint: reservationFingerprint(scope, reserve) }] });
    await expect(store.replayNumberingReservation(scope, { ...reserve, idempotencyKey: 'k' })).resolves.toMatchObject({ reservationId: 'r-1', status: 'cancelled' });
    await expect(store.replayNumberingReservation(scope, { ...reserve, requestedSize: 9, idempotencyKey: 'k' })).rejects.toBeInstanceOf(OfflineSyncReservationReplayError);
  });

  it('names migration 0003 for a schema without the key column and preserves other failures', async () => {
    const missing = storeWith(async () => { throw Object.assign(new Error('missing'), { code: '42703' }); });
    await expect(missing.replayNumberingReservation(scope, { ...reserve, idempotencyKey: 'k' })).rejects.toMatchObject({ message: 'Offline-sync migration 0003 is required.' });
    const boom = new Error('boom');
    await expect(storeWith(async () => { throw boom; }).replayNumberingReservation(scope, { ...reserve, idempotencyKey: 'k' })).rejects.toBe(boom);
  });
});

describe('forged listing cursors', () => {
  const forged = encodeCursor(['2026-99-99T99:00:00.000000Z', 'x']);

  it('rejects calendar-invalid instants and accepts real ones', () => {
    expect(() => decodeCursor(forged, 2)).toThrow('cursor is invalid.');
    expect(() => decodeCursor(encodeCursor(['2026-02-30T00:00:00.000000Z', 'x']), 2)).toThrow('cursor is invalid.');
    expect(decodeCursor(encodeCursor(['2026-02-28T23:59:59.999999Z', 'x']), 2)).toEqual(['2026-02-28T23:59:59.999999Z', 'x']);
  });

  it('returns 400 from the in-memory store and from every PostgreSQL listing before any query', async () => {
    const h = harness();
    await expect(h.service.listSyncQueueItems({ cursor: forged })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', response: { statusCode: 400 } });
    const tx = vi.fn();
    const database = { tx } as unknown as Database;
    await expect(pgListBatches(database, scope, { cursor: encodeCursor(['2026-99-99T99:00:00.000000Z', 'd', 'b']) })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(pgListItemReceipts(database, scope, { cursor: forged })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(pgListQueueItems(database, scope, { cursor: forged })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(pgListConflicts(database, scope, { cursor: forged })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    expect(tx).not.toHaveBeenCalled();
  });
});
