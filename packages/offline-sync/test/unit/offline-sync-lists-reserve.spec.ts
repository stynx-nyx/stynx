import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  OfflineSyncConfigurationError,
  OfflineSyncRangeUnavailableError,
  OfflineSyncReservationReplayError,
  OfflineSyncUpgradeRequiredError,
} from '../../src/errors';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { decodeCursor, encodeCursor, pageOf, reservationFingerprint, sortInstantOf } from '../../src/listing';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { batchContextFingerprint, stableStringify } from '../../src/transport';
import type {
  CTG9SubmitSyncBatchInput,
  OfflineSyncDurableStore,
  OfflineSyncItemContext,
  StynxOfflineSyncModuleOptions,
} from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-05, UPS-OFS-09 (receiptId), UPS-OFS-11, UPS-OFS-14 (#317).
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
    expect((await outcome({ status: 'cancelled' })).reason).toBe('inactive');
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
    expect(second.items[0]).toEqual({ receiptId: 'a-2', queueItemId: 'a-2', status: 'applied', deviceId: 'device-a', deviceBatchId: 'b-1', payloadHash: hash, receivedAt: '2026-09-28T12:00:00.000Z' });
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
    await invalid(service.listSyncBatchReceipts({ status: 'pending' as never }), 'status is invalid.');
    await invalid(service.listSyncItemReceipts({ status: 'pending' as never }), 'status is invalid.');
    await invalid(service.listSyncQueueItems({ status: 'pending' as never }), 'status is invalid.');
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
});
