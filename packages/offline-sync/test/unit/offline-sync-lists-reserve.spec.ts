import { createHash } from 'node:crypto';
import { HttpException, Logger } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  OfflineSyncConfigurationError,
  OfflineSyncError,
  OfflineSyncRangeUnavailableError,
  OfflineSyncReservationReplayError,
  OfflineSyncUpgradeRequiredError,
} from '../../src/errors';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { decodeCursor, encodeCursor, pageOf, reservationFingerprint, sortInstantOf } from '../../src/listing';
import { OFFLINE_SYNC_NO_SHIFT } from '../../src/numbering';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { batchContextFingerprint, stableStringify } from '../../src/transport';
import type {
  CTG9SubmitSyncBatchInput,
  OfflineSyncDurableStore,
  OfflineSyncItemContext,
  StynxOfflineSyncModuleOptions,
} from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-05, UPS-OFS-09 (receiptId), UPS-OFS-10, UPS-OFS-11, UPS-OFS-12, UPS-OFS-14 (#317;
// ADR-MOBILE-OFFLINE-0003 D4 and D5).
const tenantA = '00000000-0000-4000-8000-0000000000a1';
const tenantB = '00000000-0000-4000-8000-0000000000b1';
const payload = { value: 1 };
const hash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
const range = (tenantId: string, overrides: Record<string, unknown> = {}) => ({
  id: `10000000-0000-4000-8000-0000000000${tenantId.slice(-2)}`, tenantId, orgUnitId: 'org-a',
  entityType: 'citation', series: 'C', startNumber: 1, endNumber: 20, nextNumber: 1, status: 'active' as const, ...overrides,
});
const reserve = { orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'citation', requestedSize: 2 };
const item = (id: string, key: string | null = id) => ({
  queueItemId: id, entityType: 'citation', localEntityId: `local-${id}`, payloadHash: hash, payloadJson: payload,
  createdLocallyAt: '2026-09-28T12:00:00.000Z', ...(key === null ? {} : { idempotencyKey: key }),
});

function harness(options: Partial<StynxOfflineSyncModuleOptions> = {}, store = new InMemoryOfflineSyncStore()) {
  store.seedNumberingRange(range(tenantA));
  store.seedNumberingRange(range(tenantB));
  let tenantId = tenantA;
  let clock = Date.parse('2026-09-28T12:00:00.000Z');
  const applier = { apply: vi.fn(async (_trx: unknown, value: { queueItemId: string }, _context: OfflineSyncItemContext) => ({ serverEntityId: `server-${value.queueItemId}` })) };
  const service = new OfflineSyncService(store, { current: () => ({ tenantId, actorId: 'actor-a' }) }, {
    now: () => new Date(clock).toISOString(),
    policyResolver: { resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null }) },
    itemApplier: applier,
    eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    ...options,
  } as StynxOfflineSyncModuleOptions);
  return {
    store, service, applier,
    as: (tenant: string) => { tenantId = tenant; },
    tick: (ms = 1) => { clock += ms; },
  };
}
const batch = (deviceId: string, deviceBatchId: string, items = [item(`${deviceBatchId}-1`)]): CTG9SubmitSyncBatchInput =>
  ({ orgUnitId: 'org-a', deviceId, deviceBatchId, items });

describe('UPS-OFS-05 idempotent numbering reservation (in-memory)', () => {
  it('returns the same reservation for the same tenant, key and request without consuming another interval', async () => {
    const { service, store } = harness();
    const first = await service.reserveNumbering({ ...reserve, idempotencyKey: 'reserve-1' });
    const replay = await service.reserveNumbering({ ...reserve, idempotencyKey: 'reserve-1' });
    expect(replay).toEqual(first);
    const next = await service.reserveNumbering({ ...reserve, idempotencyKey: 'reserve-2' });
    expect([first.startNumber, first.endNumber, next.startNumber]).toEqual([1, 2, 3]);
    expect((await store.getNumberingConsumption({ tenantId: tenantA, actorId: 'actor-a' }, first.reservationId)).consumption).toHaveLength(2);
  });

  it('rejects the same key with a different request and leaves the original reservation intact', async () => {
    const { service } = harness();
    const first = await service.reserveNumbering({ ...reserve, idempotencyKey: 'reserve-1' });
    const error = await service.reserveNumbering({ ...reserve, requestedSize: 3, idempotencyKey: 'reserve-1' }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(OfflineSyncReservationReplayError);
    expect(error).toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT' });
    expect((error as OfflineSyncReservationReplayError).getResponse()).toEqual({ statusCode: 409,
      errorCode: 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT',
      message: 'Reservation idempotency key was already used with a different request.', retryable: false });
    expect(await service.reserveNumbering({ ...reserve, idempotencyKey: 'reserve-1' })).toEqual(first);
  });

  it('scopes keys by tenant and keeps keyless reservations on the 1.5.0 path', async () => {
    const { service, as } = harness();
    const a = await service.reserveNumbering({ ...reserve, idempotencyKey: 'shared' });
    as(tenantB);
    const b = await service.reserveNumbering({ ...reserve, idempotencyKey: 'shared' });
    expect(b.reservationId).not.toBe(a.reservationId);
    expect(b.tenantId).toBe(tenantB);
    const keyless1 = await service.reserveNumbering(reserve);
    const keyless2 = await service.reserveNumbering(reserve);
    expect(keyless2.startNumber).toBe(keyless1.endNumber + 1);
  });

  it('validates the optional key before any store call', async () => {
    const { service } = harness();
    await expect(service.reserveNumbering({ ...reserve, idempotencyKey: ' ' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'idempotencyKey is required.' });
    await expect(service.reserveNumbering({ ...reserve, idempotencyKey: 'é'.repeat(128) })).rejects.toMatchObject({ message: 'idempotencyKey must not exceed 255 bytes.' });
    await expect(service.reserveNumbering({ ...reserve, idempotencyKey: 'k'.repeat(255) })).resolves.toMatchObject({ startNumber: 1 });
  });

  it('fingerprints the request and resolved agent but not the computed default validity', () => {
    const scope = { tenantId: tenantA, actorId: 'actor-a' };
    const base = reservationFingerprint(scope, reserve);
    expect(base).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(reservationFingerprint(scope, { ...reserve, idempotencyKey: 'ignored' })).toBe(base);
    expect(reservationFingerprint({ ...scope, agentId: 'agent-b' } as never, reserve)).not.toBe(base);
    expect(reservationFingerprint(scope, { ...reserve, validUntil: '2026-09-30T00:00:00.000Z' })).not.toBe(base);
  });

  it('keeps OFFLINE_SYNC_RANGE_UNAVAILABLE and its response body while adding a typed reason', async () => {
    const store = new InMemoryOfflineSyncStore();
    const scope = { tenantId: tenantA, actorId: 'actor-a' };
    const outcome = async (overrides: Record<string, unknown>, input: Record<string, unknown> = {}) => {
      store.seedNumberingRange(range(tenantA, overrides));
      return store.reserveNumbering(scope, { ...reserve, ...input }, 'now', '2026-09-29T00:00:00.000Z').catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    };
    const exhausted = await outcome({ status: 'exhausted', nextNumber: 21 });
    expect(exhausted).toBeInstanceOf(OfflineSyncRangeUnavailableError);
    expect([exhausted.code, exhausted.reason, exhausted.getStatus()]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'exhausted', 409]);
    expect(exhausted.getResponse()).toEqual({ statusCode: 409, errorCode: 'OFFLINE_SYNC_RANGE_UNAVAILABLE',
      message: 'The selected numbering range is not active for this entity and organizational unit.', retryable: false });
    expect((await outcome({ status: 'cancelled' }, { series: 'C' })).reason).toBe('inactive');
    expect((await outcome({ status: 'cancelled' }, { rangeId: range(tenantA).id })).reason).toBe('inactive');
    // ADR-MOBILE-OFFLINE-0003 D5: with `series` omitted a cancelled range is not a candidate at all.
    expect(await outcome({ status: 'cancelled' })).toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
    expect((await outcome({ status: 'exhausted', orgUnitId: 'org-b' }, { rangeId: range(tenantA).id })).reason).toBe('inactive');
    expect((await outcome({ status: 'exhausted', entityType: 'other' }, { rangeId: range(tenantA).id })).reason).toBe('inactive');
    const capacity = await outcome({ nextNumber: 20 });
    expect([capacity.reason, capacity.message]).toEqual(['insufficient_capacity', 'The selected numbering range has insufficient capacity.']);
  });

  it('names the required migration in the upgrade error', () => {
    expect(new OfflineSyncUpgradeRequiredError().message).toBe('Offline-sync migration 0002 is required.');
    expect(new OfflineSyncUpgradeRequiredError('0003').getResponse()).toMatchObject({ message: 'Offline-sync migration 0003 is required.', statusCode: 503 });
  });
});

describe('UPS-OFS-09 applier context receipt identifier (in-memory)', () => {
  it('passes the item receipt storage key that the receipt listing exposes', async () => {
    const { service, applier } = harness();
    await service.submitSyncBatch(batch('device-a', 'b-1', [item('q-1', 'client-key-1')]), { transportIdempotencyKey: 't-1', method: 'POST', path: '/x' });
    expect(applier.apply.mock.calls[0]![2]).toMatchObject({ receiptId: 'client-key-1', batchId: 'b-1' });
    const listed = await service.listSyncItemReceipts();
    expect(listed.items.map(receipt => receipt.receiptId)).toEqual(['client-key-1']);
  });
});

describe('UPS-OFS-11 tenant-scoped listings (in-memory)', () => {
  async function populated() {
    const h = harness();
    const t = (key: string) => ({ transportIdempotencyKey: key, method: 'POST' as const, path: '/x' });
    await h.service.submitSyncBatch(batch('device-a', 'b-1', [item('a-1'), item('a-2')]), t('t-1'));
    h.tick();
    await h.service.submitSyncBatch(batch('device-b', 'b-2', [item('b-1')]), t('t-2'));
    h.tick();
    await h.service.submitSyncBatch(batch('device-a', 'b-3', [item('a-3', null)]), t('t-3'));
    h.as(tenantB);
    await h.service.submitSyncBatch(batch('device-a', 'b-9', [item('z-1')]), t('t-9'));
    h.as(tenantA);
    return h;
  }

  it('lists batch receipts newest first with device and status filters', async () => {
    const { service, as } = await populated();
    const all = await service.listSyncBatchReceipts();
    expect(all.items.map(receipt => receipt.deviceBatchId)).toEqual(['b-3', 'b-2', 'b-1']);
    expect(all.items[0]).toEqual({ deviceId: 'device-a', deviceBatchId: 'b-3', batchSequence: null, status: 'closed', responseStatus: 201, createdAt: '2026-09-28T12:00:00.002Z' });
    expect(all.nextCursor).toBe(null);
    expect((await service.listSyncBatchReceipts({ deviceId: 'device-a' })).items.map(receipt => receipt.deviceBatchId)).toEqual(['b-3', 'b-1']);
    expect((await service.listSyncBatchReceipts({ status: 'open' })).items).toEqual([]);
    as(tenantB);
    expect((await service.listSyncBatchReceipts()).items.map(receipt => receipt.deviceBatchId)).toEqual(['b-9']);
  });

  it('lists item receipts with device, batch and status filters and stable tie-break pagination', async () => {
    const { service } = await populated();
    const first = await service.listSyncItemReceipts({ limit: 2 });
    expect(first.items.map(receipt => receipt.queueItemId)).toEqual(['a-3', 'b-1']);
    const second = await service.listSyncItemReceipts({ limit: 2, cursor: first.nextCursor! });
    expect(second.items.map(receipt => receipt.queueItemId)).toEqual(['a-2', 'a-1']);
    expect(second.nextCursor).toBe(null);
    expect(second.items[0]).toEqual({ receiptId: 'a-2', queueItemId: 'a-2', status: 'applied', deviceId: 'device-a', deviceBatchId: 'b-1', payloadHash: hash, receivedAt: '2026-09-28T12:00:00.000Z',
      stynx: { version: 1, receiptId: 'a-2', appliedAt: '2026-09-28T12:00:00.000Z', serverEntityId: 'server-a-2', attempts: 1 } });
    expect((await service.listSyncItemReceipts({ deviceId: 'device-b' })).items.map(receipt => receipt.queueItemId)).toEqual(['b-1']);
    expect((await service.listSyncItemReceipts({ deviceBatchId: 'b-1' })).items).toHaveLength(2);
    const legacy = (await service.listSyncItemReceipts({ status: 'received' })).items;
    expect(legacy).toMatchObject([{ queueItemId: 'a-3', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }]);
    expect(legacy[0]!.receiptId).toMatch(/^stynx:legacy:v1:/u);
  });

  it('lists queue items with device, status and entity filters', async () => {
    const { service, as } = await populated();
    expect((await service.listSyncQueueItems()).items.map(queued => [queued.queueItemId, queued.deviceBatchId])).toEqual([['a-3', 'b-3'], ['b-1', 'b-2'], ['a-2', 'b-1'], ['a-1', 'b-1']]);
    expect((await service.listSyncQueueItems({ deviceId: 'device-a', status: 'applied' })).items.map(queued => queued.queueItemId)).toEqual(['a-2', 'a-1']);
    expect((await service.listSyncQueueItems({ entityType: 'other' })).items).toEqual([]);
    as(tenantB);
    expect((await service.listSyncQueueItems()).items.map(queued => queued.queueItemId)).toEqual(['z-1']);
  });

  it('lists E6 queue items with their device batch', async () => {
    const store = new InMemoryOfflineSyncStore();
    const service = new OfflineSyncService(store, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, { now: () => '2026-09-28T12:00:00.000Z' });
    await service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'e6-batch', items: [item('e6-1') as never] });
    expect((await service.listSyncQueueItems()).items).toMatchObject([{ queueItemId: 'e6-1', deviceBatchId: 'e6-batch', status: 'received' }]);
  });

  it('lists open and resolved conflicts with type and queue item filters', async () => {
    const store = new InMemoryOfflineSyncStore();
    let now = '2026-09-28T12:00:00.000Z';
    const service = new OfflineSyncService(store, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, { now: () => now });
    await service.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'e6', items: [item('c-1') as never, { ...item('c-2'), payloadHash: `sha256:${'b'.repeat(64)}` } as never] });
    const first = await service.openConflict('c-1', { conflictType: 'version', description: 'one' });
    now = '2026-09-28T12:00:01.000Z';
    const second = await service.openConflict('c-2', { conflictType: 'domain', description: 'two' });
    await service.resolveConflict(first.conflictId, { resolution: 'server-wins' });
    const all = await service.listSyncConflicts();
    expect(all.items.map(conflict => conflict.conflictId)).toEqual([second.conflictId, first.conflictId]);
    expect(all.items[1]).toMatchObject({ status: 'resolved', resolution: 'server-wins', createdAt: '2026-09-28T12:00:00.000Z' });
    expect((await service.listSyncConflicts({ status: 'open' })).items.map(conflict => conflict.conflictId)).toEqual([second.conflictId]);
    expect((await service.listSyncConflicts({ conflictType: 'version' })).items.map(conflict => conflict.queueItemId)).toEqual(['c-1']);
    expect((await service.listSyncConflicts({ queueItemId: 'c-2' })).items).toHaveLength(1);
    expect(all.items.map(conflict => conflict.deviceId)).toEqual(['device-a', 'device-a']);
    expect((await service.listSyncConflicts({ deviceId: 'device-a', status: 'open' })).items.map(conflict => conflict.conflictId)).toEqual([second.conflictId]);
    expect((await service.listSyncConflicts({ deviceId: 'device-b' })).items).toEqual([]);
  });

  it('records concurrency and numbering conflicts in the conflict listing', async () => {
    const pairs = [{ firstItemId: 'p-1', secondItemId: 'p-2' }];
    const { service } = harness({
      policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: 5, maxBatchItems: null }) },
      concurrencyDetector: { detect: async (_trx, value) => ({ suspected: value.queueItemId === 'p-2', pairs }) },
    });
    await service.submitSyncBatch(batch('device-a', 'pair', [item('p-1'), item('p-2'), { ...item('n-1'), reservedNumber: 999 }]), { transportIdempotencyKey: 'pair', method: 'POST', path: '/x' });
    const conflicts = (await service.listSyncConflicts()).items;
    expect(conflicts.map(conflict => [conflict.queueItemId, conflict.conflictType]).sort()).toEqual([['n-1', 'domain'], ['p-1', 'concurrency'], ['p-2', 'concurrency']]);
    expect(conflicts.every(conflict => conflict.deviceId === 'device-a')).toBe(true);
    expect((await service.listSyncConflicts({ deviceId: 'device-a', conflictType: 'domain' })).items.map(conflict => conflict.queueItemId)).toEqual(['n-1']);
    expect((await service.listSyncItemReceipts({ status: 'conflict' })).items.map(receipt => receipt.queueItemId).sort()).toEqual(['p-1', 'p-2']);
  });

  it('validates limit, cursor, filters and status before reading', async () => {
    const { service } = harness();
    const invalid = (promise: Promise<unknown>, message: string) => expect(promise).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message });
    await invalid(service.listSyncQueueItems({ limit: 0 }), 'limit must be an integer between 1 and 200.');
    await invalid(service.listSyncQueueItems({ limit: 201 }), 'limit must be an integer between 1 and 200.');
    await invalid(service.listSyncQueueItems({ limit: 1.5 }), 'limit must be an integer between 1 and 200.');
    await expect(service.listSyncQueueItems({ limit: 200 })).resolves.toEqual({ items: [], nextCursor: null });
    await invalid(service.listSyncQueueItems({ cursor: '' }), 'cursor is required.');
    await invalid(service.listSyncQueueItems({ cursor: 'not-a-cursor' }), 'cursor is invalid.');
    await invalid(service.listSyncConflicts({ cursor: encodeCursor(['2026-09-28T12:00:00.000000Z']) }), 'cursor is invalid.');
    await invalid(service.listSyncConflicts({ cursor: encodeCursor(['yesterday', 'x']) }), 'cursor is invalid.');
    await invalid(service.listSyncConflicts({ cursor: Buffer.from('[1,2]').toString('base64url') }), 'cursor is invalid.');
    await invalid(service.listSyncQueueItems({ deviceId: ' ' }), 'deviceId is required.');
    await invalid(service.listSyncItemReceipts({ deviceBatchId: '' }), 'deviceBatchId is required.');
    await invalid(service.listSyncConflicts({ queueItemId: '' }), 'queueItemId is required.');
    await invalid(service.listSyncConflicts({ deviceId: ' ' }), 'deviceId is required.');
    await invalid(service.listSyncBatchReceipts({ status: 'pending' as never }), 'status is invalid.');
    await invalid(service.listSyncItemReceipts({ status: 'done' as never }), 'status is invalid.');
    await invalid(service.listSyncQueueItems({ status: 'done' as never }), 'status is invalid.');
    // `pending` is a queue status since ADR-MOBILE-OFFLINE-0003 D1.
    await expect(service.listSyncItemReceipts({ status: 'pending' })).resolves.toEqual({ items: [], nextCursor: null });
    await expect(service.listSyncQueueItems({ status: 'pending' })).resolves.toEqual({ items: [], nextCursor: null });
    await invalid(service.listSyncConflictActions({ conflictId: '' }), 'conflictId is required.');
    await invalid(service.listSyncConflicts({ status: 'closed' as never }), 'status is invalid.');
  });

  it('fails as a configuration error when a custom durable store has no listing operation', async () => {
    const custom = { reserveNumbering: vi.fn() } as unknown as OfflineSyncDurableStore;
    const service = new OfflineSyncService(custom, { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {});
    for (const call of [() => service.listSyncBatchReceipts(), () => service.listSyncItemReceipts(), () => service.listSyncQueueItems(), () => service.listSyncConflicts()])
      await expect(call()).rejects.toBeInstanceOf(OfflineSyncConfigurationError);
  });

  it('pages in-memory rows by the shared keyset and cursor encoding', () => {
    const rows = ['a', 'b', 'c'].map((id, index) => ({ key: [sortInstantOf(`2026-09-28T12:00:0${index % 2}.000Z`), id], value: id }));
    const first = pageOf(rows, 2, undefined, 2);
    expect(first.items).toEqual(['b', 'c']);
    expect(decodeCursor(first.nextCursor!, 2)).toEqual(['2026-09-28T12:00:00.000000Z', 'c']);
    expect(pageOf(rows, 2, first.nextCursor!, 2)).toEqual({ items: ['a'], nextCursor: null });
    expect(pageOf(rows, 2, undefined, undefined).items).toHaveLength(3);
    expect(decodeCursor(undefined, 2)).toBe(null);
  });
});

const transportOf = (key: string) => ({ transportIdempotencyKey: key, method: 'POST' as const, path: '/x' });

describe('UPS-OFS-10 non-canonical payload hash is a per-item integrity rejection (in-memory, ADR-MOBILE-OFFLINE-0003 D4)', () => {
  it('rejects 1-byte, 128-byte and 255-byte non-canonical hashes per item while canonical siblings apply, without consuming the key', async () => {
    const { service, applier } = harness();
    const result = await service.submitSyncBatch(batch('device-a', 'nc-1', [
      { ...item('nc-1-a'), payloadHash: 'x' }, { ...item('nc-1-b'), payloadHash: 'h'.repeat(128) },
      { ...item('nc-1-c'), payloadHash: `sha256:${'A'.repeat(64)}` }, { ...item('nc-1-d'), payloadHash: 'é'.repeat(127) + 'z' }, item('nc-1-e'),
    ]), transportOf('nc-1'));
    expect(result.receipt.status).toBe('closed');
    expect(result.receipt.items).toEqual([
      { queueItemId: 'nc-1-a', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'nc-1-b', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'nc-1-c', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'nc-1-d', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'nc-1-e', status: 'applied' },
    ]);
    expect(result.items.map(stored => [stored.queueItemId, stored.status, stored.payloadHash])).toEqual([
      ['nc-1-a', 'rejected', 'x'], ['nc-1-b', 'rejected', 'h'.repeat(128)], ['nc-1-c', 'rejected', `sha256:${'A'.repeat(64)}`],
      ['nc-1-d', 'rejected', 'é'.repeat(127) + 'z'], ['nc-1-e', 'applied', hash],
    ]);
    expect(applier.apply).toHaveBeenCalledTimes(1);
    // No receipt, queue row or effect exists for the rejected keys.
    await expect(service.getSyncItemReceipt('nc-1-a')).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND' });
    expect((await service.listSyncQueueItems()).items.map(queued => queued.queueItemId)).toEqual(['nc-1-e']);
    expect((await service.listSyncItemReceipts()).items.map(receipt => receipt.receiptId)).toEqual(['nc-1-e']);
    // The same key with a canonical hash applies in a later batch: the key was never consumed.
    const later = await service.submitSyncBatch(batch('device-a', 'nc-2', [item('nc-2-a', 'nc-1-a')]), transportOf('nc-2'));
    expect(later.receipt.items).toEqual([{ queueItemId: 'nc-2-a', status: 'applied' }]);
    expect(applier.apply).toHaveBeenCalledTimes(2);
    // With an existing original the item is still rejected the same way; the original is untouched.
    const again = await service.submitSyncBatch(batch('device-a', 'nc-3', [{ ...item('nc-3-a', 'nc-1-a'), payloadHash: 'x' }]), transportOf('nc-3'));
    expect(again.receipt.items).toEqual([{ queueItemId: 'nc-3-a', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }]);
    expect(await service.getSyncItemReceipt('nc-1-a')).toEqual({ queueItemId: 'nc-2-a', status: 'applied',
      stynx: { version: 1, receiptId: 'nc-1-a', appliedAt: '2026-09-28T12:00:00.000Z', serverEntityId: 'server-nc-2-a', attempts: 1 } });
    expect(applier.apply).toHaveBeenCalledTimes(2);
  });

  it('keeps a missing, non-string, empty or over-long hash as a batch-wide 400 in CTG9 mode and every non-canonical hash as 400 in E6 mode', async () => {
    const { service } = harness();
    const structural = (payloadHash: unknown) => expect(service.submitSyncBatch(batch('device-a', 'nc-400', [{ ...item('nc-400'), payloadHash } as never]), transportOf('nc-400')))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'payloadHash must be a string of 1 to 255 bytes.' });
    await structural(undefined);
    await structural(42);
    await structural('');
    await structural('é'.repeat(128));
    const e6 = new OfflineSyncService(new InMemoryOfflineSyncStore(), { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, {});
    for (const payloadHash of ['x', 'h'.repeat(128), `sha256:${'A'.repeat(64)}`])
      await expect(e6.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'e6', items: [{ ...item('e6-1'), payloadHash } as never] }))
        .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'payloadHash must be a canonical sha256-prefixed hexadecimal digest.' });
  });
});

describe('UPS-OFS-12 numbering sentinel and range contract (in-memory, ADR-MOBILE-OFFLINE-0003 D5)', () => {
  it('accepts the documented no-shift sentinel as an ordinary shift and rejects every other stynx: shift', async () => {
    const { service } = harness();
    expect(OFFLINE_SYNC_NO_SHIFT).toBe('stynx:no-shift');
    const shiftless = await service.reserveNumbering({ ...reserve, shiftId: OFFLINE_SYNC_NO_SHIFT, idempotencyKey: 'no-shift' });
    expect(shiftless.shiftId).toBe('stynx:no-shift');
    expect(await service.reserveNumbering({ ...reserve, shiftId: OFFLINE_SYNC_NO_SHIFT, idempotencyKey: 'no-shift' })).toEqual(shiftless);
    const scope = { tenantId: tenantA, actorId: 'actor-a' };
    expect(reservationFingerprint(scope, { ...reserve, shiftId: OFFLINE_SYNC_NO_SHIFT })).not.toBe(reservationFingerprint(scope, reserve));
    for (const shiftId of ['stynx:', 'stynx:other', 'stynx:no-shift:x', 'stynx:legacy:v1:abc'])
      await expect(service.reserveNumbering({ ...reserve, shiftId })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'shiftId uses a reserved namespace.' });
    expect((await service.reserveNumbering({ ...reserve, shiftId: 'shift-stynx:ok' })).shiftId).toBe('shift-stynx:ok');
  });

  it('returns a tail to an exhausted range but never revives a cancelled range', async () => {
    const { service, store } = harness();
    store.seedNumberingRange(range(tenantA, { endNumber: 4 }));
    const first = await service.reserveNumbering({ ...reserve, requestedSize: 2 });
    const tail = await service.reserveNumbering({ ...reserve, requestedSize: 2 });
    expect([first.startNumber, tail.endNumber]).toEqual([1, 4]);
    const spent = await service.reserveNumbering({ ...reserve, requestedSize: 1 }).catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    expect(spent).toMatchObject({ code: 'OFFLINE_SYNC_RANGE_UNAVAILABLE', reason: 'exhausted' });
    await service.cancelNumberingReservation(tail.reservationId);
    expect(await service.reserveNumbering({ ...reserve, requestedSize: 1 })).toMatchObject({ startNumber: 3, endNumber: 3 });
    const last = await service.reserveNumbering({ ...reserve, requestedSize: 1 });
    expect(last.startNumber).toBe(4);
    // The consumer cancels the (exhausted) range; cancelling the tail reservation must not reactivate it.
    store.seedNumberingRange(range(tenantA, { endNumber: 4, nextNumber: 5, status: 'cancelled' }));
    await service.cancelNumberingReservation(last.reservationId);
    const refused = await service.reserveNumbering({ ...reserve, series: 'C', requestedSize: 1 }).catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    expect([refused.code, refused.reason]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'inactive']);
    await expect(service.reserveNumbering({ ...reserve, requestedSize: 1 })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
  });

  it('skips cancelled ranges only when series is omitted', async () => {
    const { service, store } = harness();
    store.seedNumberingRange(range(tenantA, { id: '10000000-0000-4000-8000-00000000000a', series: 'A', status: 'cancelled' }));
    expect((await service.reserveNumbering({ ...reserve, requestedSize: 1 })).series).toBe('C');
    const explicit = await service.reserveNumbering({ ...reserve, series: 'A', requestedSize: 1 }).catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    expect(explicit.reason).toBe('inactive');
    const byId = await service.reserveNumbering({ ...reserve, rangeId: '10000000-0000-4000-8000-00000000000a', requestedSize: 1 }).catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    expect(byId.reason).toBe('inactive');
  });
});

describe('UPS-OFS-14 contract sensors (in-memory)', () => {
  it('V-01 maxBatchItems:null admits 101 items and a configured limit is reported verbatim', async () => {
    const { service } = harness();
    const items = Array.from({ length: 101 }, (_, index) => item(`v01-${index}`));
    await expect(service.submitSyncBatch(batch('device-a', 'v01', items), { transportIdempotencyKey: 'v01', method: 'POST', path: '/x' })).resolves.toMatchObject({ acceptedItems: 101 });
    await expect(service.submitSyncBatch(batch('device-a', 'v01-empty', []), { transportIdempotencyKey: 'v01e', method: 'POST', path: '/x' }))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'items must contain at least 1 queue item.' });
    const limited = harness({ policyResolver: { resolve: async () => ({ maxBatchItems: 2 }) } });
    await expect(limited.service.submitSyncBatch(batch('device-a', 'v01-3', items.slice(0, 3)), { transportIdempotencyKey: 'v013', method: 'POST', path: '/x' }))
      .rejects.toMatchObject({ message: 'items must contain between 1 and 2 queue items.' });
  });

  it('V-02 unkeyed item stays received with the neutral code; an unsequenced batch consumes no sequence', async () => {
    const { service } = harness({ legacyItemIdentityResolver: { resolve: async input => `legacy:${input.deviceId}:${input.localEntityId}` } });
    const result = await service.submitSyncBatch(batch('device-a', 'v02', [item('v02-1', null)]), { transportIdempotencyKey: 'v02', method: 'POST', path: '/x' });
    expect(result.receipt.items).toEqual([{ queueItemId: 'v02-1', status: 'received', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }]);
    expect(result.receipt.batchSequence).toBe(null);
    await expect(service.submitSyncBatch({ ...batch('device-a', 'v02-seq'), batchSequence: 1 }, { transportIdempotencyKey: 'v02s', method: 'POST', path: '/x' }))
      .resolves.toMatchObject({ receipt: { batchSequence: 1 } });
  });

  it('V-06 resolves policy per operation at the injected clock; policy TTL wins and validUntil is honored', async () => {
    const resolve = vi.fn(async () => ({ reservationTtlMs: 60_000 }));
    const { service } = harness({ policyResolver: { resolve }, reservationTtlMs: 1 });
    const reserved = await service.reserveNumbering(reserve);
    expect(resolve).toHaveBeenCalledWith({ tenantId: tenantA, orgUnitId: 'org-a', operation: 'reserve-numbering', at: '2026-09-28T12:00:00.000Z' });
    expect(reserved.validUntil).toBe('2026-09-28T12:01:00.000Z');
    const explicit = await service.reserveNumbering({ ...reserve, validUntil: '2026-09-30T00:00:00.000Z' });
    expect(explicit.validUntil).toBe('2026-09-30T00:00:00.000Z');
    const missing = harness({ policyResolver: { resolve: async () => ({}) } });
    await expect(missing.service.reserveNumbering(reserve)).rejects.toMatchObject({ message: 'reservation policy is missing.' });
  });

  it('V-15 stableStringify sorts keys and serializes undefined as null rather than omitting it', () => {
    expect(stableStringify({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(stableStringify({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1,"b":null}');
    expect(stableStringify({ a: 1, b: undefined })).not.toBe(stableStringify({ a: 1 }));
    const input = { orgUnitId: 'org-a', items: [item('v15')] };
    expect(batchContextFingerprint(input, 'agent')).toBe(batchContextFingerprint({ ...input, items: [{ ...item('v15'), payloadJson: { value: 1 } }] }, 'agent'));
    expect(batchContextFingerprint(input, 'agent')).not.toBe(batchContextFingerprint(input, 'other-agent'));
  });
  it('V-03 repeated sequence is 409, a gap is 422 naming expected and received, a changed replay is 409, and a hash mismatch is a per-item rejection', async () => {
    const { service } = harness();
    await service.submitSyncBatch({ ...batch('device-a', 'v03-1'), batchSequence: 1 }, transportOf('v03-1'));
    const repeated = await service.submitSyncBatch({ ...batch('device-a', 'v03-dup'), batchSequence: 1 }, transportOf('v03-dup')).catch((caught: unknown) => caught as OfflineSyncError);
    expect([repeated.code, repeated.getStatus()]).toEqual(['OFFLINE_SYNC_BATCH_CONFLICT', 409]);
    const gap = await service.submitSyncBatch({ ...batch('device-a', 'v03-gap'), batchSequence: 3 }, transportOf('v03-gap')).catch((caught: unknown) => caught as OfflineSyncError);
    expect([gap.code, gap.getStatus(), gap.message]).toEqual(['OFFLINE_SYNC_BATCH_SEQUENCE', 422, 'Expected batch sequence 2; received 3.']);
    const changed = await service.submitSyncBatch({ ...batch('device-a', 'v03-1', [item('v03-1-1'), item('v03-1-2')]), batchSequence: 1 }, transportOf('v03-1b')).catch((caught: unknown) => caught as OfflineSyncError);
    expect([changed.code, changed.getStatus()]).toEqual(['OFFLINE_SYNC_BATCH_CONFLICT', 409]);
    const resequenced = await service.submitSyncBatch({ ...batch('device-a', 'v03-1'), batchSequence: 2 }, transportOf('v03-1c')).catch((caught: unknown) => caught as OfflineSyncError);
    expect(resequenced.code).toBe('OFFLINE_SYNC_BATCH_CONFLICT');
    const mismatch = await service.submitSyncBatch(batch('device-a', 'v03-2', [{ ...item('v03-2-1', 'v03-1-1'), payloadHash: `sha256:${'f'.repeat(64)}` }]), transportOf('v03-2'));
    expect(mismatch.receipt.items).toEqual([{ queueItemId: 'v03-2-1', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }]);
    expect(await service.getSyncItemReceipt('v03-1-1')).toEqual({ queueItemId: 'v03-1-1', status: 'applied',
      stynx: { version: 1, receiptId: 'v03-1-1', appliedAt: '2026-09-28T12:00:00.000Z', serverEntityId: 'server-v03-1-1', attempts: 1 } });
  });

  it('V-04 each item has its own outcome: a 4xx error is rejected with its code, a numbering outcome maps to rejected or conflict with context, and any other error leaves the item received and the batch open', async () => {
    const { service, applier } = harness();
    applier.apply.mockImplementation(async (_trx: unknown, value: { queueItemId: string }) => {
      if (value.queueItemId === 'v04-4xx') throw Object.assign(new HttpException('domain refused', 422), { code: 'DOMAIN_REFUSED' });
      if (value.queueItemId === 'v04-boom') throw new Error('outage');
      return { serverEntityId: `server-${value.queueItemId}` };
    });
    const reservation = await service.reserveNumbering({ ...reserve, requestedSize: 1 });
    const result = await service.submitSyncBatch(batch('device-a', 'v04', [
      item('v04-4xx'), { ...item('v04-nocov'), reservedNumber: 999 },
      { ...item('v04-expired'), reservedNumber: reservation.startNumber, createdLocallyAt: '2026-09-28T14:00:00.000Z' },
      item('v04-ok'), item('v04-boom'),
    ]), transportOf('v04'));
    expect(applier.apply).toHaveBeenCalledTimes(3);
    expect(result.receipt.items).toEqual([
      { queueItemId: 'v04-4xx', status: 'rejected', errorCode: 'DOMAIN_REFUSED' },
      { queueItemId: 'v04-nocov', status: 'rejected', errorCode: 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE',
        context: { number: 999, reservationId: null, conflictId: expect.any(String), allowedActions: ['reject', 'retry_after_correction'] } },
      { queueItemId: 'v04-expired', status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED',
        context: { number: reservation.startNumber, reservationId: reservation.reservationId, conflictId: expect.any(String), allowedActions: ['reject', 'retry_after_correction'] } },
      { queueItemId: 'v04-ok', status: 'applied' },
      { queueItemId: 'v04-boom', status: 'received', errorCode: 'OFFLINE_SYNC_ITEM_FAILED' },
    ]);
    expect(result.receipt).toMatchObject({ status: 'open', responseStatus: null });
    expect(result.conflicts).toEqual(['v04-expired']);
    // The outcome is written per item: the receipt lookup reflects each separately.
    expect(await service.getSyncItemReceipt('v04-4xx')).toMatchObject({ status: 'rejected', errorCode: 'DOMAIN_REFUSED' });
    expect(await service.getSyncItemReceipt('v04-ok')).toEqual({ queueItemId: 'v04-ok', status: 'applied',
      stynx: { version: 1, receiptId: 'v04-ok', appliedAt: '2026-09-28T12:00:00.000Z', serverEntityId: 'server-v04-ok', attempts: 1 } });
    expect(await service.getSyncItemReceipt('v04-boom')).toMatchObject({ status: 'received' });
  });

  it('V-05 a same-key replay in another batch returns the original receipt without apply; a hash mismatch and a reused queue ID are per-item rejections that do not stop the batch', async () => {
    const { service, applier } = harness();
    await service.submitSyncBatch(batch('device-a', 'v05-1', [item('v05-q1', 'v05-k1')]), transportOf('v05-1'));
    expect(applier.apply).toHaveBeenCalledTimes(1);
    const replay = await service.submitSyncBatch(batch('device-b', 'v05-2', [item('v05-q2', 'v05-k1')]), transportOf('v05-2'));
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(replay.duplicateItems).toBe(1);
    expect(replay.receipt.items).toEqual([{ queueItemId: 'v05-q2', status: 'applied', context: { originalQueueItemId: 'v05-q1' } }]);
    const mixed = await service.submitSyncBatch(batch('device-a', 'v05-3', [
      { ...item('v05-q3', 'v05-k1'), payloadHash: `sha256:${'e'.repeat(64)}` }, item('v05-q1', 'v05-k9'), item('v05-q4', 'v05-k4'),
    ]), transportOf('v05-3'));
    expect(mixed.receipt.items).toEqual([
      { queueItemId: 'v05-q3', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' },
      { queueItemId: 'v05-q1', status: 'rejected', errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED' },
      { queueItemId: 'v05-q4', status: 'applied' },
    ]);
    expect(mixed.receipt.status).toBe('closed');
    expect(applier.apply).toHaveBeenCalledTimes(2);
    expect(await service.getSyncItemReceipt('v05-k1')).toEqual({ queueItemId: 'v05-q1', status: 'applied',
      stynx: { version: 1, receiptId: 'v05-k1', appliedAt: '2026-09-28T12:00:00.000Z', serverEntityId: 'server-v05-q1', attempts: 1 } });
    await expect(service.getSyncItemReceipt('v05-k9')).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND' });
  });

  it('V-07 the detector runs once per applied item after apply only with a window; the handoff port is consulted per pair; both acts become conflict while the effect is kept; no window only warns', async () => {
    const order: string[] = [];
    const pair = { firstItemId: 'v07-a', secondItemId: 'v07-b' };
    const detect = vi.fn(async (_trx: unknown, value: { queueItemId: string }) => {
      order.push(`detect:${value.queueItemId}`);
      if (value.queueItemId === 'v07-b') return { suspected: true, pairs: [pair] };
      if (value.queueItemId === 'v07-d') return { suspected: true, pairs: [{ firstItemId: 'v07-c', secondItemId: 'v07-d' }] };
      return { suspected: false, pairs: [] };
    });
    const permits = vi.fn(async () => true);
    permits.mockResolvedValueOnce(false);
    const { service, applier } = harness({ policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: 5, maxBatchItems: null }) }, concurrencyDetector: { detect }, handoffPort: { permits } });
    applier.apply.mockImplementation(async (_trx: unknown, value: { queueItemId: string }) => { order.push(`apply:${value.queueItemId}`); return { serverEntityId: `server-${value.queueItemId}` }; });
    await service.submitSyncBatch(batch('device-a', 'v07', [item('v07-a'), item('v07-b')]), transportOf('v07'));
    expect(order).toEqual(['apply:v07-a', 'detect:v07-a', 'apply:v07-b', 'detect:v07-b']);
    expect(permits).toHaveBeenCalledTimes(1);
    expect(permits.mock.calls[0]![1]).toEqual(pair);
    const conflicts = (await service.listSyncConflicts({ conflictType: 'concurrency', status: 'open' })).items;
    expect(conflicts.map(conflict => conflict.queueItemId).sort()).toEqual(['v07-a', 'v07-b']);
    expect((await service.listSyncQueueItems({ status: 'conflict' })).items.map(queued => queued.queueItemId).sort()).toEqual(['v07-a', 'v07-b']);
    expect((await service.listSyncItemReceipts({ status: 'conflict' })).items.map(receipt => receipt.receiptId).sort()).toEqual(['v07-a', 'v07-b']);
    // A permitted handoff keeps both acts applied.
    await service.submitSyncBatch(batch('device-b', 'v07-2', [item('v07-c'), item('v07-d')]), transportOf('v07-2'));
    expect(permits).toHaveBeenCalledTimes(2);
    expect((await service.listSyncQueueItems({ deviceId: 'device-b' })).items.map(queued => queued.status)).toEqual(['applied', 'applied']);
    // `concurrencyWindowMinutes: null` disables detection; a detector without a window only logs a warning.
    const warn = vi.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    const disabled = harness({ policyResolver: { resolve: async () => ({ concurrencyWindowMinutes: null, maxBatchItems: null }) }, concurrencyDetector: { detect } });
    detect.mockClear();
    await disabled.service.submitSyncBatch(batch('device-a', 'v07-off', [item('v07-e'), item('v07-f')]), transportOf('v07-off'));
    expect(detect).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('Offline sync concurrency window is unavailable; host detection policy must review this batch.', 'OfflineSyncService');
    warn.mockRestore();
  });

  it('V-08 resolveWithPort lets allowedActions govern refusal, refuses a resolver result that is not resolved, and records the resolution', async () => {
    const resolve = vi.fn();
    const { service } = harness({ conflictResolver: { resolve } });
    const opened = await service.submitSyncBatch(batch('device-a', 'v08', [{ ...item('v08-1'), reservedNumber: 999 }]), transportOf('v08'));
    const conflictId = (opened.receipt.items[0]!.context as { conflictId: string }).conflictId;
    const [conflict] = (await service.listSyncConflicts({ queueItemId: 'v08-1' })).items;
    expect(conflict).toMatchObject({ conflictId, status: 'open', conflictType: 'domain', deviceId: 'device-a' });
    // A resolver status other than `open` or `resolved` is refused (ADR-MOBILE-OFFLINE-0003 D2.2).
    resolve.mockImplementation(async (_trx: unknown, id: string, action: string) => ({ ...conflict, conflictId: id, status: action === 'retry_after_correction' ? 'closed' : 'resolved' }));
    await expect(service.resolveConflict(conflictId, { resolution: 'accept_server' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', response: { statusCode: 409 } });
    expect(resolve).not.toHaveBeenCalled();
    await expect(service.resolveConflict(conflictId, { resolution: 'retry_after_correction' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect((await service.listSyncConflicts({ queueItemId: 'v08-1' })).items[0]!.status).toBe('open');
    expect((await service.listSyncConflictActions({ conflictId })).items).toEqual([]);
    const resolved = await service.resolveConflict(conflictId, { resolution: 'reject' });
    expect(resolved).toMatchObject({ conflictId, status: 'resolved', resolution: 'reject', resolvedBy: 'actor-a', resolvedAt: '2026-09-28T12:00:00.000Z' });
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve.mock.calls[1]).toEqual([expect.any(Object), conflictId, 'reject', expect.objectContaining({ tenantId: tenantA, actorId: 'actor-a', agentId: 'actor-a', orgUnitId: 'org-a', deviceId: 'device-a' })]);
    expect((await service.listSyncConflicts({ status: 'resolved' })).items).toMatchObject([{ conflictId, resolution: 'reject', resolvedBy: 'actor-a' }]);
    expect((await service.listSyncConflictActions({ conflictId })).items).toMatchObject([{ conflictId, action: 'reject', resultingStatus: 'resolved', actorId: 'actor-a', createdAt: '2026-09-28T12:00:00.000Z' }]);
    await expect(service.resolveConflict(conflictId, { resolution: 'reject' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE' });
  });

  it('V-10 the persisted agent comes from agentResolver(scope, operation) and is stored apart from the audit actor', async () => {
    const resolve = vi.fn(async (_scope: unknown, operation: string) => `agent-${operation}`);
    const { service, applier } = harness({ agentResolver: { resolve } });
    const reservation = await service.reserveNumbering(reserve);
    expect(reservation.agentId).toBe('agent-reserve-numbering');
    expect(resolve).toHaveBeenCalledWith({ tenantId: tenantA, actorId: 'actor-a' }, 'reserve-numbering');
    const result = await service.submitSyncBatch(batch('device-a', 'v10'), transportOf('v10'));
    expect(result.items[0]).toMatchObject({ agentId: 'agent-submit-sync-batch' });
    expect(applier.apply.mock.calls[0]![2]).toMatchObject({ agentId: 'agent-submit-sync-batch', actorId: 'actor-a' });
    // The resolver receives only the trusted scope and the operation name, never a request-supplied agent.
    expect(resolve.mock.calls.map(call => call.length)).toEqual([2, 2]);
    const resolvedConflict = vi.fn(async (_trx: unknown, id: string) => ({ conflictId: id, queueItemId: 'v10-c1', status: 'resolved' as const }));
    const withResolver = harness({ agentResolver: { resolve }, conflictResolver: { resolve: resolvedConflict as never } });
    const opened = await withResolver.service.submitSyncBatch(batch('device-a', 'v10-c', [{ ...item('v10-c1'), reservedNumber: 999 }]), transportOf('v10-c'));
    await withResolver.service.resolveConflict((opened.receipt.items[0]!.context as { conflictId: string }).conflictId, { resolution: 'reject' });
    expect(resolvedConflict.mock.calls[0]![3]).toMatchObject({ agentId: 'agent-submit-sync-batch', actorId: 'actor-a' });
  });

  it('V-11 requestedSize is an integer from 1 to 100, shiftId is required with only the sentinel in the stynx: namespace, exhaustion carries a reason, and concurrent reservations never overlap', async () => {
    const { service } = harness();
    for (const requestedSize of [0, 101, 1.5, Number.NaN])
      await expect(service.reserveNumbering({ ...reserve, requestedSize })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', message: 'requestedSize must be an integer between 1 and 100.' });
    await expect(service.reserveNumbering({ ...reserve, shiftId: '' })).rejects.toMatchObject({ message: 'shiftId is required.' });
    await expect(service.reserveNumbering({ ...reserve, shiftId: 'stynx:other' })).rejects.toMatchObject({ message: 'shiftId uses a reserved namespace.' });
    const shiftless = await service.reserveNumbering({ ...reserve, shiftId: OFFLINE_SYNC_NO_SHIFT, requestedSize: 1 });
    // No single-active-reservation rule exists: a second reservation for the same device and shift is accepted.
    const second = await service.reserveNumbering({ ...reserve, shiftId: OFFLINE_SYNC_NO_SHIFT, requestedSize: 1 });
    expect([shiftless.shiftId, shiftless.startNumber, second.startNumber]).toEqual(['stynx:no-shift', 1, 2]);
    const concurrent = await Promise.all(Array.from({ length: 5 }, (_, index) => service.reserveNumbering({ ...reserve, deviceId: `d-${index}`, requestedSize: 3 })));
    expect(concurrent.map(reserved => [reserved.startNumber, reserved.endNumber]).sort((x, y) => x[0]! - y[0]!)).toEqual([[3, 5], [6, 8], [9, 11], [12, 14], [15, 17]]);
    const capacity = await service.reserveNumbering({ ...reserve, requestedSize: 5 }).catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    expect([capacity.code, capacity.reason, capacity.getStatus()]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'insufficient_capacity', 409]);
    expect((await service.reserveNumbering({ ...reserve, requestedSize: 3 })).endNumber).toBe(20);
    const exhausted = await service.reserveNumbering({ ...reserve, requestedSize: 1 }).catch((caught: unknown) => caught as OfflineSyncRangeUnavailableError);
    expect([exhausted.code, exhausted.reason, exhausted.getStatus()]).toEqual(['OFFLINE_SYNC_RANGE_UNAVAILABLE', 'exhausted', 409]);
  });

  it('V-12 cancel accepts only reserved and repeats idempotently with the tail returned; block and close accept reserved or expired and repeat unchanged; settle also accepts consumed; unused numbers become blocked or expired', async () => {
    const { service } = harness();
    const first = await service.reserveNumbering({ ...reserve, requestedSize: 2 });
    const cancelled = await service.cancelNumberingReservation(first.reservationId);
    expect(cancelled.status).toBe('cancelled');
    expect(await service.cancelNumberingReservation(first.reservationId)).toEqual(cancelled);
    await expect(service.blockNumberingReservation(first.reservationId)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE', response: { statusCode: 409 } });
    await expect(service.closeNumberingReservation(first.reservationId)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    expect((await service.getNumberingConsumption(first.reservationId)).consumption.map(entry => entry.status)).toEqual(['expired', 'expired']);
    const second = await service.reserveNumbering({ ...reserve, requestedSize: 2 });
    expect([second.startNumber, second.endNumber]).toEqual([1, 2]);
    const blocked = await service.blockNumberingReservation(second.reservationId);
    expect(blocked.status).toBe('blocked');
    expect(await service.blockNumberingReservation(second.reservationId)).toEqual(blocked);
    await expect(service.cancelNumberingReservation(second.reservationId)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    await expect(service.settleNumberingReservation(second.reservationId)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    expect((await service.getNumberingConsumption(second.reservationId)).consumption.map(entry => entry.status)).toEqual(['blocked', 'blocked']);
    const third = await service.reserveNumbering({ ...reserve, requestedSize: 2 });
    const closed = await service.closeNumberingReservation(third.reservationId);
    expect(closed.status).toBe('consumed');
    expect(await service.closeNumberingReservation(third.reservationId)).toEqual(closed);
    expect(await service.settleNumberingReservation(third.reservationId)).toEqual(closed);
    await expect(service.cancelNumberingReservation(third.reservationId)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });
    expect((await service.getNumberingConsumption(third.reservationId)).consumption.map(entry => entry.status)).toEqual(['expired', 'expired']);
  });

  it('V-13 reconciliation refuses claims outside the interval before any write, records claims only while reserved, keeps one entry per number and reports missing and unexpected numbers', async () => {
    const { service } = harness();
    const reservation = await service.reserveNumbering({ ...reserve, requestedSize: 3 });
    await expect(service.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [4] })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', response: { statusCode: 400 } });
    expect((await service.getNumberingConsumption(reservation.reservationId)).consumption.map(entry => entry.status)).toEqual(['available', 'available', 'available']);
    await service.submitSyncBatch(batch('device-a', 'v13', [{ ...item('v13-1'), reservedNumber: 2 }]), transportOf('v13'));
    const reconciled = await service.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [1, 2] });
    expect(reconciled.consumption.map(entry => [entry.number, entry.status])).toEqual([[1, 'claimed-locally'], [2, 'applied'], [3, 'available']]);
    expect(reconciled.consumption[1]).toMatchObject({ serverEntityId: 'server-v13-1', finalizedAt: '2026-09-28T12:00:00.000Z' });
    expect([reconciled.missingOnServer, reconciled.unexpectedOnServer]).toEqual([[1], []]);
    const unclaimed = await service.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [] });
    expect([unclaimed.missingOnServer, unclaimed.unexpectedOnServer]).toEqual([[], [2]]);
    expect(unclaimed.consumption).toHaveLength(3);
    await service.closeNumberingReservation(reservation.reservationId);
    const afterClose = await service.reconcileNumberingReservation(reservation.reservationId, { claimedNumbers: [3] });
    expect(afterClose.consumption.map(entry => entry.status)).toEqual(['claimed-locally', 'applied', 'expired']);
    expect(afterClose.missingOnServer).toEqual([3]);
  });

  it('V-14 exactly one event per applied item inside its transaction, keyed by the receipt key; nothing for rejections, conflicts, reservations or resolutions', async () => {
    const appendInTransaction = vi.fn(async () => undefined);
    const appendManyInTransaction = vi.fn(async () => undefined);
    const { service, applier } = harness({ eventPort: { appendInTransaction, appendManyInTransaction } });
    await service.reserveNumbering(reserve);
    expect(appendInTransaction).not.toHaveBeenCalled();
    await service.submitSyncBatch(batch('device-a', 'v14', [item('v14-ok', 'v14-key'), { ...item('v14-bad', 'v14-key2'), reservedNumber: 999 }, { ...item('v14-hash', 'v14-key3'), payloadHash: 'x' }]), transportOf('v14'));
    expect(appendInTransaction).toHaveBeenCalledTimes(1);
    expect(appendInTransaction).toHaveBeenCalledWith(applier.apply.mock.calls[0]![0], { entity: 'citation', entityId: 'server-v14-ok', idempotencyKey: 'v14-key', payload });
    expect(appendManyInTransaction).not.toHaveBeenCalled();
    await service.submitSyncBatch(batch('device-a', 'v14-2', [item('v14-ok2', 'v14-key')]), transportOf('v14-2'));
    const opened = await service.openConflict('v14-ok', { conflictType: 'version', description: 'stale' });
    await service.resolveConflict(opened.conflictId, { resolution: 'server-wins' });
    expect(appendInTransaction).toHaveBeenCalledTimes(1);
  });
});
