import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES } from '../../src/stynx-context';
import type {
  CTG9SubmitSyncBatchInput, CTG9SyncBatchItemInput, OfflineSyncConflictResolver, OfflineSyncItemContext,
  OfflineSyncStynxContext, StynxOfflineSyncModuleOptions, SyncConflict,
} from '../../src/types';

// INV-OFFLINE-001; UPS-OFS-06, UPS-OFS-07, UPS-OFS-08 (#317; ADR-MOBILE-OFFLINE-0003 D1, D2, D3) on the
// in-memory store through the service. The PostgreSQL twin is
// test/integration/offline-sync-pending-review-context.integration.spec.ts.
const tenantA = '00000000-0000-4000-8000-0000000000a1';
const tenantB = '00000000-0000-4000-8000-0000000000b1';
const at = '2026-09-28T12:00:00.000Z';
const later = '2026-09-28T14:00:00.000Z';
const payload = { value: 1 };
const hash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
const otherHash = `sha256:${'b'.repeat(64)}`;
const range = (tenantId: string) => ({
  id: `10000000-0000-4000-8000-0000000000${tenantId.slice(-2)}`, tenantId, orgUnitId: 'org-a',
  entityType: 'citation', series: 'C', startNumber: 1, endNumber: 20, nextNumber: 1, status: 'active' as const,
});
const reserve = { orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'citation', requestedSize: 2 };
const item = (id: string, key = id, overrides: Partial<CTG9SyncBatchItemInput> = {}): CTG9SyncBatchItemInput => ({
  queueItemId: id, entityType: 'citation', localEntityId: `local-${id}`, idempotencyKey: key, payloadHash: hash, payloadJson: payload,
  createdLocallyAt: at, ...overrides,
});
const batch = (deviceId: string, deviceBatchId: string, items: CTG9SyncBatchItemInput[]): CTG9SubmitSyncBatchInput =>
  ({ orgUnitId: 'org-a', deviceId, deviceBatchId, items });
const transportOf = (key: string) => ({ transportIdempotencyKey: `t-${key}`, method: 'POST' as const, path: '/offline-sync/sync-batches' });
/** Resolver: `manual_review` keeps the conflict open, every other action closes it; actions come from the stored evidence. */
const resolverOf = (allowed?: readonly string[], attributes?: Record<string, unknown>): OfflineSyncConflictResolver & { resolve: ReturnType<typeof vi.fn> } => ({
  resolve: vi.fn(async (_trx: unknown, conflictId: string, action: string) => ({
    conflictId, tenantId: tenantA, queueItemId: '', localEntityId: '', payloadHash: hash, conflictType: 'domain', description: 'host',
    status: action === 'manual_review' ? 'open' : 'resolved', ...(attributes ? { consumerAttributes: attributes } : {}),
  } as SyncConflict)),
  ...(allowed ? { allowedActions: async () => allowed as never } : {}),
});

function harness(options: Partial<StynxOfflineSyncModuleOptions> = {}) {
  const store = new InMemoryOfflineSyncStore();
  store.seedNumberingRange(range(tenantA));
  store.seedNumberingRange(range(tenantB));
  let tenantId = tenantA;
  const events: { idempotencyKey: string; entityId: string }[] = [];
  const applier = { apply: vi.fn(async (_trx: unknown, value: { queueItemId: string }, _context: OfflineSyncItemContext) => ({ serverEntityId: `server-${value.queueItemId}` })) };
  const service = new OfflineSyncService(store, { current: () => ({ tenantId, actorId: 'actor-a' }) }, {
    now: () => at,
    policyResolver: { resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null }) },
    itemApplier: applier,
    eventPort: { appendInTransaction: async (_trx, event) => { events.push({ idempotencyKey: event.idempotencyKey, entityId: event.entityId }); }, appendManyInTransaction: async () => undefined },
    ...options,
  } as StynxOfflineSyncModuleOptions);
  return { store, service, applier, events, as: (tenant: string) => { tenantId = tenant; } };
}

/** Reserves two numbers and submits one keyed item whose local creation time is after the reservation expiry. */
async function expiredConflict(service: OfflineSyncService, deviceId: string, id: string, allowed: readonly string[] = ['reject', 'retry_after_correction']) {
  const reservation = await service.reserveNumbering({ ...reserve, deviceId });
  const result = await service.submitSyncBatch(batch(deviceId, `${id}-b1`, [item(id, id, { reservedNumber: reservation.startNumber, reservationId: reservation.reservationId, createdLocallyAt: later })]), transportOf(`${id}-b1`));
  const receipt = result.receipt.items[0]!;
  expect(receipt).toMatchObject({ status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', context: { conflictId: expect.any(String), allowedActions: allowed } });
  return { reservation, conflictId: (receipt.context as { conflictId: string }).conflictId };
}

describe('UPS-OFS-06 pending queue state (ADR-MOBILE-OFFLINE-0003 D1, in-memory)', () => {
  it('UPS-OFS-06 (D1) retry_after_correction moves the item to pending and the conflict to resolved in one call, and the item is listed with that status', async () => {
    const resolver = resolverOf();
    const { service } = harness({ conflictResolver: resolver });
    const { conflictId } = await expiredConflict(service, 'device-a', 'p-1');
    expect((await service.listSyncQueueItems({ status: 'conflict' })).items.map(queued => queued.queueItemId)).toEqual(['p-1']);
    const resolved = await service.resolveConflict(conflictId, { resolution: 'retry_after_correction', description: 'number corrected', userRef: 'user-7' });
    expect(resolved).toMatchObject({ conflictId, status: 'resolved', resolution: 'retry_after_correction', resolvedBy: 'actor-a', resolvedAt: at });
    expect(resolver.resolve).toHaveBeenCalledWith(expect.any(Object), conflictId, 'retry_after_correction', expect.objectContaining({ tenantId: tenantA, deviceId: 'device-a' }));
    expect((await service.listSyncConflicts({ queueItemId: 'p-1' })).items).toMatchObject([{ conflictId, status: 'resolved', resolution: 'retry_after_correction' }]);
    expect((await service.listSyncQueueItems({ status: 'pending' })).items).toMatchObject([{ queueItemId: 'p-1', status: 'pending', deviceBatchId: 'p-1-b1' }]);
    expect((await service.listSyncItemReceipts({ status: 'pending' })).items).toMatchObject([{ receiptId: 'p-1', status: 'pending', deviceBatchId: 'p-1-b1' }]);
    const receipt = await service.getSyncItemReceipt('p-1');
    expect(receipt).toMatchObject({ queueItemId: 'p-1', status: 'pending', context: { conflictId }, stynx: { version: 1, receiptId: 'p-1', reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', attempts: 1 } });
    expect([receipt.errorCode, receipt.stynx?.appliedAt]).toEqual([undefined, undefined]);
    expect((await service.listSyncConflictActions({ conflictId })).items).toMatchObject([{ action: 'retry_after_correction', reason: 'number corrected', userRef: 'user-7', resultingStatus: 'resolved' }]);
    // D1 item 7: nothing expires or supersedes a pending item.
    expect((await service.listSyncQueueItems({ status: 'pending' })).items).toHaveLength(1);
  });

  it('UPS-OFS-06 (D1) refuses the transition for an applied item, a non-conflict item, an item with another open conflict and an item with an applied number', async () => {
    const pairs = [{ firstItemId: 'c-1', secondItemId: 'c-2' }];
    const resolver = resolverOf(['reject', 'retry_after_correction']);
    const { service, applier } = harness({
      conflictResolver: resolver,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null, concurrencyWindowMinutes: 5 }) },
      concurrencyDetector: { detect: async (_trx, value) => ({ suspected: value.queueItemId === 'c-2', pairs }) },
    });
    // Applied with a concurrency suspicion: the effect was committed, so the item never returns to pending.
    await service.submitSyncBatch(batch('device-a', 'cb-1', [item('c-1')]), transportOf('cb-1'));
    const suspected = await service.submitSyncBatch(batch('device-b', 'cb-2', [item('c-2')]), transportOf('cb-2'));
    const concurrencyConflict = (suspected.receipt.items[0]!.context as { conflictId: string }).conflictId;
    expect(await service.getSyncItemReceipt('c-2')).toMatchObject({ status: 'conflict', stynx: { appliedAt: at, serverEntityId: 'server-c-2', relatedQueueItemId: 'c-1', reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED', retryable: true } });
    await expect(service.resolveConflict(concurrencyConflict, { resolution: 'retry_after_correction' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', response: { statusCode: 409 } });
    expect((await service.listSyncQueueItems({ status: 'pending' })).items).toEqual([]);
    expect((await service.listSyncConflicts({ queueItemId: 'c-2' })).items[0]!.status).toBe('open');
    // A rejected item (no coverage) has a domain conflict but is not `conflict`.
    const rejected = await service.submitSyncBatch(batch('device-a', 'rb-1', [item('r-1', 'r-1', { reservedNumber: 999 })]), transportOf('rb-1'));
    expect(rejected.receipt.items[0]!.status).toBe('rejected');
    await expect(service.resolveConflict((rejected.receipt.items[0]!.context as { conflictId: string }).conflictId, { resolution: 'retry_after_correction' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect((await service.listSyncQueueItems({ deviceId: 'device-a', status: 'rejected' })).items.map(queued => queued.queueItemId)).toEqual(['r-1']);
    // Another open conflict on the item (an integrity conflict from a different-hash submission) blocks the transition.
    const { conflictId } = await expiredConflict(service, 'device-c', 'x-1');
    await service.submitSyncBatch(batch('device-c', 'xb-2', [item('x-1b', 'x-1', { payloadHash: otherHash })]), transportOf('xb-2'));
    expect((await service.listSyncConflicts({ queueItemId: 'x-1', status: 'open' })).items.map(conflict => conflict.conflictType).sort()).toEqual(['domain', 'integrity']);
    await expect(service.resolveConflict(conflictId, { resolution: 'retry_after_correction' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', message: 'The item cannot return to pending.' });
    expect((await service.listSyncQueueItems({ deviceId: 'device-c' })).items[0]!.status).toBe('conflict');
    // The refusal is the existing 409 and the conflict stays open; `reject` still closes it.
    await expect(service.resolveConflict(conflictId, { resolution: 'reject' })).resolves.toMatchObject({ status: 'resolved', resolution: 'reject' });
    expect(applier.apply).toHaveBeenCalledTimes(2);
  });

  it('UPS-OFS-06 (D1) a later batch of the same device with the same key and hash re-applies a pending item exactly once with a fresh item transaction, a new event key and no reissued number; replay, reads, another device, the same batch and a different hash never re-apply', async () => {
    const resolver = resolverOf();
    const { service, applier, events } = harness({ conflictResolver: resolver });
    const { reservation, conflictId } = await expiredConflict(service, 'device-a', 'q-1');
    await service.resolveConflict(conflictId, { resolution: 'retry_after_correction' });
    const first = await service.submitSyncBatch(batch('device-a', 'q-1-b1', [item('q-1', 'q-1', { reservedNumber: reservation.startNumber, reservationId: reservation.reservationId, createdLocallyAt: later })]), transportOf('q-1-b1'));
    // D1 item 5: the closed batch replays its original bytes and applies nothing; reads apply nothing.
    expect(first.receipt.items[0]).toMatchObject({ status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED' });
    expect(await service.getSyncItemReceipt('q-1')).toMatchObject({ status: 'pending' });
    expect(applier.apply).not.toHaveBeenCalled();
    // Another device with the same key: the committed status is returned, nothing applies.
    const foreign = await service.submitSyncBatch(batch('device-z', 'qz-1', [item('q-1z', 'q-1')]), transportOf('qz-1'));
    expect(foreign.receipt.items).toMatchObject([{ queueItemId: 'q-1z', status: 'pending', context: { originalQueueItemId: 'q-1', conflictId } }]);
    expect(foreign.receipt.items[0]!.errorCode).toBe(undefined);
    expect(foreign.duplicateItems).toBe(1);
    // A different hash under the same key is an integrity rejection and leaves the item pending.
    const changed = await service.submitSyncBatch(batch('device-a', 'q-1-b2', [item('q-1', 'q-1', { payloadHash: otherHash })]), transportOf('q-1-b2'));
    expect(changed.receipt.items).toEqual([{ queueItemId: 'q-1', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }]);
    expect(await service.getSyncItemReceipt('q-1')).toMatchObject({ status: 'pending' });
    expect(applier.apply).not.toHaveBeenCalled();
    // D1 item 4: a later batch, same device, same key and hash, with a corrected reservation, applies once.
    const corrected = await service.reserveNumbering({ ...reserve, deviceId: 'device-a' });
    const retry = item('q-1', 'q-1', { reservedNumber: corrected.startNumber, reservationId: corrected.reservationId });
    const [second, third] = await Promise.all([
      service.submitSyncBatch(batch('device-a', 'q-1-b3', [retry]), transportOf('q-1-b3')),
      service.submitSyncBatch(batch('device-a', 'q-1-b4', [retry]), transportOf('q-1-b4')),
    ]);
    expect(applier.apply).toHaveBeenCalledTimes(1);
    expect(applier.apply.mock.calls[0]![1]).toMatchObject({ queueItemId: 'q-1', reservedNumber: corrected.startNumber });
    expect(applier.apply.mock.calls[0]![2]).toMatchObject({ batchId: 'q-1-b3', receiptId: 'q-1' });
    expect([second.receipt.items[0]!.status, third.receipt.items[0]!.status]).toEqual(['applied', 'applied']);
    expect(second.receipt.status).toBe('closed');
    // D1 item 6: the event key of the re-application differs from the receipt key.
    expect(events).toEqual([{ idempotencyKey: 'q-1:retry:2', entityId: 'server-q-1' }]);
    const receipt = await service.getSyncItemReceipt('q-1');
    expect(receipt).toMatchObject({ queueItemId: 'q-1', status: 'applied', context: { conflictId }, stynx: { version: 1, receiptId: 'q-1', appliedAt: at, serverEntityId: 'server-q-1', attempts: 2 } });
    expect(receipt.errorCode).toBe(undefined);
    expect(receipt.stynx).toEqual({ version: 1, receiptId: 'q-1', appliedAt: at, serverEntityId: 'server-q-1', attempts: 2 });
    // The receipt keeps its original batch binding; the queue item is applied; the corrected number is consumed once.
    expect((await service.listSyncItemReceipts({ status: 'applied', deviceId: 'device-a' })).items).toMatchObject([{ receiptId: 'q-1', deviceBatchId: 'q-1-b1', stynx: { attempts: 2 } }]);
    expect((await service.listSyncQueueItems({ deviceId: 'device-a' })).items).toMatchObject([{ queueItemId: 'q-1', status: 'applied', deviceBatchId: 'q-1-b1', stynx: { appliedAt: at, serverEntityId: 'server-q-1' } }]);
    expect((await service.getNumberingConsumption(corrected.reservationId)).consumption[0]).toMatchObject({ number: corrected.startNumber, status: 'applied', serverEntityId: 'server-q-1' });
    expect((await service.getNumberingConsumption(reservation.reservationId)).consumption.every(entry => entry.status !== 'applied')).toBe(true);
    // Replays of the re-applying batches return their stored bytes; the pending state is never re-entered.
    expect((await service.submitSyncBatch(batch('device-a', 'q-1-b3', [retry]), transportOf('q-1-b3'))).receipt.items[0]!.status).toBe('applied');
    expect((await service.listSyncQueueItems({ status: 'pending' })).items).toEqual([]);
    expect(applier.apply).toHaveBeenCalledTimes(1);
  });

  it('UPS-OFS-06 (D1) a retryable failure during re-application leaves the item pending and the batch open; a 4xx failure rejects it; without an applier the committed status is returned', async () => {
    const resolver = resolverOf();
    const { service, applier } = harness({ conflictResolver: resolver });
    const { conflictId } = await expiredConflict(service, 'device-a', 'f-1');
    await service.resolveConflict(conflictId, { resolution: 'retry_after_correction' });
    const corrected = await service.reserveNumbering({ ...reserve, deviceId: 'device-a' });
    const retry = item('f-1', 'f-1', { reservedNumber: corrected.startNumber, reservationId: corrected.reservationId });
    applier.apply.mockRejectedValueOnce(new Error('transient'));
    const open = await service.submitSyncBatch(batch('device-a', 'f-1-b2', [retry]), transportOf('f-1-b2'));
    expect(open.receipt).toMatchObject({ status: 'open', items: [{ queueItemId: 'f-1', status: 'pending', errorCode: 'OFFLINE_SYNC_ITEM_FAILED' }] });
    expect(await service.getSyncItemReceipt('f-1')).toMatchObject({ status: 'pending', stynx: { errorCode: 'OFFLINE_SYNC_ITEM_FAILED', errorMessage: 'transient', attempts: 2, retryable: true } });
    applier.apply.mockRejectedValueOnce(new HttpException({ errorCode: 'DOMAIN_REFUSED' }, 422));
    const refused = await service.submitSyncBatch(batch('device-a', 'f-1-b3', [retry]), transportOf('f-1-b3'));
    expect(refused.receipt.items).toMatchObject([{ queueItemId: 'f-1', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_FAILED', context: { conflictId } }]);
    expect(await service.getSyncItemReceipt('f-1')).toMatchObject({ status: 'rejected', stynx: { attempts: 3, retryable: false } });
    expect((await service.listSyncQueueItems({ deviceId: 'device-a' })).items[0]!.status).toBe('rejected');
    // Without an applier a pending receipt is reported as a cross-batch duplicate, never applied.
    const { service: plain, store } = harness({ conflictResolver: resolver, itemApplier: undefined as never, eventPort: undefined as never });
    await plain.submitSyncBatch(batch('device-a', 'nb-1', [item('n-1')]), transportOf('nb-1'));
    expect((await plain.submitSyncBatch(batch('device-a', 'nb-2', [item('n-1')]), transportOf('nb-2'))).receipt.items[0]!.status).toBe('received');
    expect(store.getQueueItem(tenantA, 'n-1')?.status).toBe('received');
  });
});

describe('UPS-OFS-07 manual review keeps the conflict open (ADR-MOBILE-OFFLINE-0003 D2, in-memory)', () => {
  it('V-08 UPS-OFS-07 (D2) manual_review records one history row per action and keeps the conflict open with no resolution; a later closing action resolves it; allowedActions still governs; history is tenant-scoped', async () => {
    const resolver = resolverOf(['manual_review', 'reject', 'retry_after_correction'], { reviewer: 'desk-3' });
    const { service, as } = harness({ conflictResolver: resolver });
    const { conflictId } = await expiredConflict(service, 'device-a', 'm-1', ['manual_review', 'reject', 'retry_after_correction']);
    const first = await service.resolveConflict(conflictId, { resolution: 'manual_review', description: 'needs a supervisor', userRef: 'user-1' });
    expect(first).toEqual({ conflictId, tenantId: tenantA, queueItemId: '', localEntityId: '', payloadHash: hash, conflictType: 'domain', description: 'host', status: 'open',
      stynx: { version: 1, receiptId: 'm-1', reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', attempts: 1, retryable: true, consumerAttributes: { reviewer: 'desk-3' } } });
    expect([first.resolvedAt, first.resolution]).toEqual([undefined, undefined]);
    const [stored] = (await service.listSyncConflicts({ queueItemId: 'm-1' })).items;
    expect(stored).toMatchObject({ conflictId, status: 'open', conflictType: 'domain', stynx: { consumerAttributes: { reviewer: 'desk-3' } } });
    expect([stored!.resolution, stored!.resolvedAt]).toEqual([undefined, undefined]);
    expect((await service.listSyncQueueItems({ deviceId: 'device-a' })).items[0]!.status).toBe('conflict');
    const second = await service.resolveConflict(conflictId, { resolution: 'manual_review', userRef: 'user-2' });
    expect(second.status).toBe('open');
    expect((await service.listSyncConflictActions({ conflictId })).items).toMatchObject([
      { conflictId, tenantId: tenantA, action: 'manual_review', userRef: 'user-2', actorId: 'actor-a', resultingStatus: 'open', createdAt: at },
      { conflictId, tenantId: tenantA, action: 'manual_review', reason: 'needs a supervisor', userRef: 'user-1', actorId: 'actor-a', resultingStatus: 'open', createdAt: at },
    ]);
    expect((await service.listSyncConflictActions({ conflictId })).items[0]!.reason).toBe(undefined);
    // Governance of actions is evaluated on every call.
    await expect(service.resolveConflict(conflictId, { resolution: 'accept_server' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', response: { statusCode: 409 } });
    expect(resolver.resolve).toHaveBeenCalledTimes(2);
    // A later final action closes the conflict and appends its own row; the history is newest first and paged.
    const closed = await service.resolveConflict(conflictId, { resolution: 'reject', description: 'wrong agency' });
    expect(closed).toMatchObject({ conflictId, status: 'resolved', resolution: 'reject', resolvedBy: 'actor-a', resolvedAt: at, stynx: { consumerAttributes: { reviewer: 'desk-3' } } });
    const page = await service.listSyncConflictActions({ conflictId, limit: 2 });
    expect(page.items.map(action => [action.action, action.resultingStatus])).toEqual([['reject', 'resolved'], ['manual_review', 'open']]);
    const rest = await service.listSyncConflictActions({ conflictId, limit: 2, cursor: page.nextCursor! });
    expect(rest).toMatchObject({ items: [{ action: 'manual_review', reason: 'needs a supervisor' }], nextCursor: null });
    expect(new Set([...page.items, ...rest.items].map(action => action.actionId)).size).toBe(3);
    await expect(service.resolveConflict(conflictId, { resolution: 'reject' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE' });
    // Tenant B sees no history of tenant A's conflict and cannot resolve it.
    as(tenantB);
    expect((await service.listSyncConflictActions({ conflictId })).items).toEqual([]);
    await expect(service.resolveConflict(conflictId, { resolution: 'reject' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_NOT_FOUND' });
  });

  it('V-08 UPS-OFS-07 (D2) a resolver that forbids accept_server on a concurrency conflict is honoured, an unknown resolver status is refused without a history row, and the legacy path without a resolver is unchanged', async () => {
    const pairs = [{ firstItemId: 'k-1', secondItemId: 'k-2' }];
    const resolver = resolverOf(['manual_review', 'reject']);
    const { service } = harness({
      conflictResolver: resolver,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null, concurrencyWindowMinutes: 5 }) },
      concurrencyDetector: { detect: async (_trx, value) => ({ suspected: value.queueItemId === 'k-2', pairs }) },
    });
    await service.submitSyncBatch(batch('device-a', 'kb-1', [item('k-1')]), transportOf('kb-1'));
    const suspected = await service.submitSyncBatch(batch('device-b', 'kb-2', [item('k-2')]), transportOf('kb-2'));
    const conflictId = (suspected.receipt.items[0]!.context as { conflictId: string }).conflictId;
    await expect(service.resolveConflict(conflictId, { resolution: 'accept_server' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    expect(resolver.resolve).not.toHaveBeenCalled();
    expect((await service.resolveConflict(conflictId, { resolution: 'manual_review' })).status).toBe('open');
    resolver.resolve.mockResolvedValueOnce({ conflictId, status: 'closed' } as never);
    await expect(service.resolveConflict(conflictId, { resolution: 'reject' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', message: 'Conflict resolver did not resolve the conflict.' });
    expect((await service.listSyncConflictActions({ conflictId })).items).toHaveLength(1);
    expect((await service.listSyncConflicts({ conflictType: 'concurrency', status: 'open' })).items.map(conflict => conflict.queueItemId).sort()).toEqual(['k-1', 'k-2']);
    // D2 item 7: without a resolver the E6 `manual-review` value resolves as in 1.5.3 and writes no history.
    const legacy = new OfflineSyncService(new InMemoryOfflineSyncStore(), { current: () => ({ tenantId: tenantA, actorId: 'actor-a' }) }, { now: () => at });
    await legacy.submitSyncBatch({ orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'e6', items: [item('e6-1')] });
    const opened = await legacy.openConflict('e6-1', { conflictType: 'version', description: 'stale' });
    await expect(legacy.resolveConflict(opened.conflictId, { resolution: 'manual-review' })).resolves.toMatchObject({ status: 'resolved', resolution: 'manual-review', resolvedAt: at });
    await expect(legacy.resolveConflict(opened.conflictId, { resolution: 'manual_review' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    expect((await legacy.listSyncConflictActions({ conflictId: opened.conflictId })).items).toEqual([]);
  });
});

describe('UPS-OFS-08 typed receipt and conflict context (ADR-MOBILE-OFFLINE-0003 D3, in-memory)', () => {
  it('V-05 UPS-OFS-08 (D3) receipts, queue items and conflicts expose the versioned stynx object apart from context, written once and identical on replay, with consumer attributes verbatim and size-bounded', async () => {
    const applied: OfflineSyncStynxContext = { version: 1, receiptId: 'd-1', appliedAt: at, serverEntityId: 'server-d-1', attempts: 1, consumerAttributes: { agency: 'A1', nested: { ok: true } } };
    const { service, applier } = harness();
    applier.apply.mockImplementation(async (_trx: unknown, value: { queueItemId: string }) => ({ serverEntityId: `server-${value.queueItemId}`, ...(value.queueItemId === 'd-1' ? { consumerAttributes: { agency: 'A1', nested: { ok: true } } } : {}) }));
    const result = await service.submitSyncBatch(batch('device-a', 'db-1', [item('d-1'), item('d-2')]), transportOf('db-1'));
    // The submit result keeps its published fields; the platform object is exposed by lookups and listings (D3.5).
    expect(result.receipt.items).toEqual([{ queueItemId: 'd-1', status: 'applied' }, { queueItemId: 'd-2', status: 'applied' }]);
    const receipt = await service.getSyncItemReceipt('d-1');
    expect(receipt).toEqual({ queueItemId: 'd-1', status: 'applied', stynx: applied });
    expect(receipt.context).toBe(undefined);
    expect(await service.getSyncItemReceipt('d-2')).toEqual({ queueItemId: 'd-2', status: 'applied', stynx: { version: 1, receiptId: 'd-2', appliedAt: at, serverEntityId: 'server-d-2', attempts: 1 } });
    expect((await service.listSyncItemReceipts({ deviceId: 'device-a' })).items.find(row => row.receiptId === 'd-1')).toMatchObject({ receiptId: 'd-1', stynx: applied });
    expect((await service.listSyncQueueItems({ deviceId: 'device-a' })).items.find(row => row.queueItemId === 'd-1')).toMatchObject({ queueItemId: 'd-1', status: 'applied', stynx: applied });
    expect((await service.getSyncBatchReceipt('device-a', 'db-1')).items).toEqual(result.receipt.items);
    // D3 item 4: a replay returns the stored values and never recomputes or recounts.
    await service.submitSyncBatch(batch('device-a', 'db-1', [item('d-1'), item('d-2')]), transportOf('db-1'));
    expect(await service.getSyncItemReceipt('d-1')).toEqual({ queueItemId: 'd-1', status: 'applied', stynx: applied });
    expect(applier.apply).toHaveBeenCalledTimes(2);
    // Failed items: error code, message, attempt count and retryable flag; a resumed batch counts a second attempt.
    applier.apply.mockRejectedValueOnce(new HttpException({ errorCode: 'DOMAIN_REFUSED', message: 'agency closed' }, 422));
    applier.apply.mockRejectedValueOnce(new Error('connection reset'));
    const failed = await service.submitSyncBatch(batch('device-a', 'db-2', [item('d-3'), item('d-4')]), transportOf('db-2'));
    expect(failed.receipt.status).toBe('open');
    expect(await service.getSyncItemReceipt('d-3')).toEqual({ queueItemId: 'd-3', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_FAILED',
      stynx: { version: 1, receiptId: 'd-3', errorCode: 'OFFLINE_SYNC_ITEM_FAILED', errorMessage: 'agency closed', attempts: 1, retryable: false } });
    expect(await service.getSyncItemReceipt('d-4')).toEqual({ queueItemId: 'd-4', status: 'received', errorCode: 'OFFLINE_SYNC_ITEM_FAILED',
      stynx: { version: 1, receiptId: 'd-4', errorCode: 'OFFLINE_SYNC_ITEM_FAILED', errorMessage: 'connection reset', attempts: 1, retryable: true } });
    const resumed = await service.submitSyncBatch(batch('device-a', 'db-2', [item('d-3'), item('d-4')]), transportOf('db-2'));
    expect(resumed.receipt.items.map(row => row.status)).toEqual(['rejected', 'applied']);
    expect(await service.getSyncItemReceipt('d-4')).toEqual({ queueItemId: 'd-4', status: 'applied', stynx: { version: 1, receiptId: 'd-4', appliedAt: at, serverEntityId: 'server-d-4', attempts: 2 } });
    // D3 item 3: attributes outside the bound or not an object reject the item as invalid input and roll back its effect.
    applier.apply.mockResolvedValueOnce({ serverEntityId: 'server-d-5', consumerAttributes: { blob: 'x'.repeat(OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES) } });
    applier.apply.mockResolvedValueOnce({ serverEntityId: 'server-d-6', consumerAttributes: ['not', 'an', 'object'] as never });
    const bounded = await service.submitSyncBatch(batch('device-a', 'db-3', [item('d-5'), item('d-6')]), transportOf('db-3'));
    expect(bounded.receipt.items).toEqual([
      { queueItemId: 'd-5', status: 'rejected', errorCode: 'OFFLINE_SYNC_INVALID_INPUT' },
      { queueItemId: 'd-6', status: 'rejected', errorCode: 'OFFLINE_SYNC_INVALID_INPUT' },
    ]);
    expect((await service.getSyncItemReceipt('d-5')).stynx).toMatchObject({ errorCode: 'OFFLINE_SYNC_INVALID_INPUT', errorMessage: `consumerAttributes must be a JSON object of at most ${OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES} bytes.`, attempts: 1, retryable: false });
    // Numbering conflicts carry the reason code, the attempt and the retryable flag on the receipt and on the conflict.
    const { conflictId } = await expiredConflict(service, 'device-n', 'd-7');
    expect(await service.getSyncItemReceipt('d-7')).toMatchObject({ status: 'conflict', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', context: { conflictId, allowedActions: ['reject', 'retry_after_correction'] },
      stynx: { version: 1, receiptId: 'd-7', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', errorMessage: 'OFFLINE_SYNC_NUMBERING_EXPIRED', reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', attempts: 1, retryable: false } });
    expect((await service.listSyncConflicts({ queueItemId: 'd-7' })).items[0]).toMatchObject({ conflictType: 'domain', stynx: { version: 1, receiptId: 'd-7', reasonCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED', attempts: 1, retryable: true } });
    // Resolver attributes are bounded the same way and never reach the evidence when refused.
    const bad = resolverOf(['reject'], { blob: 'x'.repeat(OFFLINE_SYNC_CONSUMER_ATTRIBUTES_MAX_BYTES) });
    const strict = harness({ conflictResolver: bad });
    const refused = await expiredConflict(strict.service, 'device-a', 'd-8', ['reject']);
    await expect(strict.service.resolveConflict(refused.conflictId, { resolution: 'reject' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT', response: { statusCode: 400 } });
    expect((await strict.service.listSyncConflicts({ queueItemId: 'd-8' })).items[0]).toMatchObject({ status: 'open' });
    expect((await strict.service.listSyncConflictActions({ conflictId: refused.conflictId })).items).toEqual([]);
  });

  it('V-05 UPS-OFS-08 (D3.6) a same-key submission with a different hash records one integrity conflict per received hash that references the untouched original, allows reject only and never drives it to pending', async () => {
    const { service, applier } = harness({ conflictResolver: resolverOf() });
    await service.submitSyncBatch(batch('device-a', 'ib-1', [item('i-1')]), transportOf('ib-1'));
    const original = await service.getSyncItemReceipt('i-1');
    const first = await service.submitSyncBatch(batch('device-b', 'ib-2', [item('i-1b', 'i-1', { payloadHash: otherHash })]), transportOf('ib-2'));
    expect(first.receipt.items).toEqual([{ queueItemId: 'i-1b', status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }]);
    expect(first.duplicateItems).toBe(0);
    const [conflict] = (await service.listSyncConflicts({ conflictType: 'integrity' })).items;
    expect(conflict).toMatchObject({ queueItemId: 'i-1', payloadHash: hash, conflictType: 'integrity', status: 'open', deviceId: 'device-a',
      description: 'Payload hash differs from the stored item.',
      stynx: { version: 1, receiptId: 'i-1', reasonCode: 'OFFLINE_SYNC_ITEM_INTEGRITY', receivedPayloadHash: otherHash, storedPayloadHash: hash, relatedQueueItemId: 'i-1b', retryable: false } });
    // The original and its effect are unchanged; a repeated submission reuses the conflict.
    expect(await service.getSyncItemReceipt('i-1')).toEqual(original);
    expect((await service.listSyncQueueItems({ deviceId: 'device-a' })).items).toMatchObject([{ queueItemId: 'i-1', status: 'applied', payloadHash: hash }]);
    await service.submitSyncBatch(batch('device-c', 'ib-3', [item('i-1c', 'i-1', { payloadHash: otherHash })]), transportOf('ib-3'));
    expect((await service.listSyncConflicts({ conflictType: 'integrity' })).items).toHaveLength(1);
    // A non-canonical hash with an existing original also records the conflict (D4 item 4); a third hash is a second conflict.
    await service.submitSyncBatch(batch('device-a', 'ib-4', [item('i-1d', 'i-1', { payloadHash: 'x' })]), transportOf('ib-4'));
    const conflicts = (await service.listSyncConflicts({ conflictType: 'integrity', queueItemId: 'i-1' })).items;
    expect(conflicts.map(entry => entry.stynx?.receivedPayloadHash).sort()).toEqual([otherHash, 'x']);
    expect(applier.apply).toHaveBeenCalledTimes(1);
    // Without an original there is no conflict row: the rejected attempt alone carries the received hash.
    await service.submitSyncBatch(batch('device-a', 'ib-5', [item('i-9', 'i-9', { payloadHash: 'y' })]), transportOf('ib-5'));
    expect((await service.listSyncConflicts({ conflictType: 'integrity' })).items).toHaveLength(2);
    // Allowed actions are `reject` only: a retry is refused and the original never becomes pending; `reject` closes the conflict.
    await expect(service.resolveConflict(conflict!.conflictId, { resolution: 'retry_after_correction' })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION', message: 'Resolution action is not allowed.' });
    expect((await service.listSyncQueueItems({ status: 'pending' })).items).toEqual([]);
    await expect(service.resolveConflict(conflict!.conflictId, { resolution: 'reject' })).resolves.toMatchObject({ status: 'resolved', resolution: 'reject' });
    expect(await service.getSyncItemReceipt('i-1')).toEqual(original);
    // A resolver override may widen the actions, but D1 item 3 still refuses an applied original.
    const widened = harness({ conflictResolver: resolverOf(['reject', 'retry_after_correction']) });
    await widened.service.submitSyncBatch(batch('device-a', 'wb-1', [item('w-1')]), transportOf('wb-1'));
    await widened.service.submitSyncBatch(batch('device-a', 'wb-2', [item('w-1b', 'w-1', { payloadHash: otherHash })]), transportOf('wb-2'));
    const [wide] = (await widened.service.listSyncConflicts({ conflictType: 'integrity' })).items;
    expect(wide!.stynx?.retryable).toBe(true);
    await expect(widened.service.resolveConflict(wide!.conflictId, { resolution: 'retry_after_correction' })).rejects.toMatchObject({ message: 'The item cannot return to pending.' });
  });
});

describe('in-memory parity edges (ADR-MOBILE-OFFLINE-0003 D1, D3)', () => {
  it('UPS-OFS-06 (D1) re-applies a pending item declared under another queue id: the ports see the original id, the result names it, and the stored item keeps it', async () => {
    const resolver = resolverOf();
    const { service, applier, events } = harness({ conflictResolver: resolver });
    const { conflictId } = await expiredConflict(service, 'device-a', 'o-1');
    await service.resolveConflict(conflictId, { resolution: 'retry_after_correction' });
    const corrected = await service.reserveNumbering({ ...reserve, deviceId: 'device-a' });
    const result = await service.submitSyncBatch(batch('device-a', 'o-1-b2', [item('o-1-renamed', 'o-1', { reservedNumber: corrected.startNumber, reservationId: corrected.reservationId })]), transportOf('o-1-b2'));
    expect(applier.apply.mock.calls[0]![1]).toMatchObject({ queueItemId: 'o-1', reservedNumber: corrected.startNumber });
    expect(result.receipt.items).toMatchObject([{ queueItemId: 'o-1-renamed', status: 'applied', context: { originalQueueItemId: 'o-1', conflictId } }]);
    expect(result.items[0]).toMatchObject({ queueItemId: 'o-1-renamed', context: { originalQueueItemId: 'o-1' } });
    expect(events).toEqual([{ idempotencyKey: 'o-1:retry:2', entityId: 'server-o-1' }]);
    expect((await service.listSyncQueueItems({ deviceId: 'device-a' })).items.map(queued => [queued.queueItemId, queued.status, queued.deviceBatchId])).toEqual([['o-1', 'applied', 'o-1-b1']]);
    expect(await service.getSyncItemReceipt('o-1')).toMatchObject({ queueItemId: 'o-1', status: 'applied', stynx: { attempts: 2, serverEntityId: 'server-o-1' } });
  });

  it('V-05 UPS-OFS-08 (D3) marks a legacy partner of a suspected pair without an earlier platform object, records a non-Error applier rejection verbatim, and attaches resolver attributes to a conflict that had no platform object', async () => {
    const pairs = [{ firstItemId: 'l-1', secondItemId: 'l-2' }];
    const resolver = resolverOf(['reject'], { desk: 9 });
    const { service, applier, store } = harness({
      conflictResolver: resolver,
      policyResolver: { resolve: async () => ({ reservationTtlMs: 3_600_000, maxBatchItems: null, concurrencyWindowMinutes: 5 }) },
      concurrencyDetector: { detect: async (_trx, value) => ({ suspected: value.queueItemId === 'l-2', pairs }) },
    });
    // An unkeyed legacy item never applied, so its receipt has no platform object until the suspicion marks it.
    await service.submitSyncBatch(batch('device-a', 'lb-1', [item('l-1', 'l-1', { idempotencyKey: undefined as never })]), transportOf('lb-1'));
    await service.submitSyncBatch(batch('device-b', 'lb-2', [item('l-2')]), transportOf('lb-2'));
    const marked = (await service.listSyncItemReceipts({ status: 'conflict' })).items.find(row => row.queueItemId === 'l-1');
    expect(marked).toMatchObject({ status: 'conflict', context: { relatedQueueItemId: 'l-2' }, stynx: { version: 1, reasonCode: 'OFFLINE_SYNC_CONCURRENCY_SUSPECTED', relatedQueueItemId: 'l-2', retryable: false } });
    expect(marked!.stynx!.appliedAt).toBe(undefined);
    applier.apply.mockRejectedValueOnce('plain text failure');
    await service.submitSyncBatch(batch('device-a', 'lb-3', [item('l-3')]), transportOf('lb-3'));
    expect(await service.getSyncItemReceipt('l-3')).toMatchObject({ status: 'received', stynx: { errorCode: 'OFFLINE_SYNC_ITEM_FAILED', errorMessage: 'plain text failure', retryable: true } });
    // A conflict opened through the legacy path has no platform object; the resolver's attributes create it.
    await service.submitSyncBatch(batch('device-a', 'lb-4', [item('l-4')]), transportOf('lb-4'));
    const opened = await store.openConflict({ tenantId: tenantA, actorId: 'actor-a' }, 'l-4', { conflictType: 'version', description: 'stale' }, at);
    expect(await service.resolveConflict(opened.conflictId, { resolution: 'reject' })).toMatchObject({ status: 'resolved', resolution: 'reject', stynx: { version: 1, consumerAttributes: { desk: 9 } } });
    expect((await service.listSyncConflicts({ queueItemId: 'l-4' })).items).toMatchObject([{ status: 'resolved', stynx: { version: 1, consumerAttributes: { desk: 9 } } }]);
    // A resolver that fails while a numbering conflict is being recorded fails the batch and releases the tenant gate.
    const failing = harness({ conflictResolver: { resolve: resolver.resolve, allowedActions: async () => { throw new Error('resolver down'); } } });
    await expect(failing.service.submitSyncBatch(batch('device-a', 'gb-1', [item('g-1', 'g-1', { reservedNumber: 999 })]), transportOf('gb-1'))).rejects.toThrow('resolver down');
    expect((await failing.service.submitSyncBatch(batch('device-a', 'gb-2', [item('g-2')]), transportOf('gb-2'))).receipt.items).toEqual([{ queueItemId: 'g-2', status: 'applied' }]);
  });
});
