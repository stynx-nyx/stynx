import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import type { CTG9SubmitSyncBatchInput, DurableBatchExecutionOptions, OfflineSyncConflictResolver, NumberingRange, TrustedOfflineSyncScope } from '../../src/types';

const tenant = '00000000-0000-4000-8000-0000000000a1';
const now = '2026-09-29T12:00:00.000Z';
const scope: TrustedOfflineSyncScope = { tenantId: tenant, actorId: 'actor-a' };
const payload = { value: 1 };
const digest = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
const item = (queueItemId: string, overrides: Record<string, unknown> = {}) => ({
  queueItemId, entityType: 'citation', localEntityId: `local-${queueItemId}`,
  idempotencyKey: `key-${queueItemId}`, payloadHash: digest, payloadJson: payload,
  createdLocallyAt: now, ...overrides,
});
const batch = (deviceBatchId: string, items = [item('item-a')], overrides: Record<string, unknown> = {}): CTG9SubmitSyncBatchInput => ({
  orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId, items, ...overrides,
});
const options = (overrides: Partial<DurableBatchExecutionOptions> = {}): DurableBatchExecutionOptions => ({
  transportIdempotencyKey: overrides.transportIdempotencyKey ?? 'transport-key', method: 'POST', path: '/sync/batch',
  agentId: scope.actorId, policy: {}, ports: {},
  transport: { transportIdempotencyKey: overrides.transportIdempotencyKey ?? 'transport-key', method: 'POST', path: '/sync/batch', requestBody: overrides.requestBody },
  ...overrides,
});
const range: NumberingRange = {
  id: 'range-a', tenantId: tenant, orgUnitId: 'org-a', entityType: 'citation', series: 'A',
  startNumber: 10, endNumber: 12, nextNumber: 10, status: 'active',
};

describe('InMemoryOfflineSyncStore direct CTG9 contracts', () => {
  it('cancels a CTG9 reservation idempotently and rewinds only an unconsumed tail', async () => {
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange(range);
    const reservation = await store.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'citation', requestedSize: 3,
    }, now, now);
    await store.reconcileNumberingReservation(scope, reservation.reservationId, { claimedNumbers: [10] }, now);
    const cancelled = await store.cancelNumberingReservation({ ...scope, ctg9: true } as never, reservation.reservationId, {}, now);
    expect(cancelled.status).toBe('cancelled');
    expect(await store.cancelNumberingReservation({ ...scope, ctg9: true } as never, reservation.reservationId, {}, now)).toEqual(cancelled);
    await expect(store.getNumberingConsumption(scope, reservation.reservationId)).resolves.toMatchObject({
      consumption: [{ status: 'claimed-locally' }, { status: 'expired' }, { status: 'expired' }],
    });
    await expect(store.blockNumberingReservation(scope, 'missing', {}, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    await expect(store.getNumberingConsumption(scope, 'missing')).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    await expect(store.reconcileNumberingReservation(scope, 'missing', {}, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' });
    await expect(store.reconcileNumberingReservation(scope, reservation.reservationId, { claimedNumbers: [99] }, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });

    const nonTail = new InMemoryOfflineSyncStore();
    nonTail.seedNumberingRange(range);
    const earlier = await nonTail.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'earlier', entityType: 'citation', requestedSize: 1,
    }, now, now);
    await nonTail.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'later', entityType: 'citation', requestedSize: 1,
    }, now, now);
    await nonTail.cancelNumberingReservation({ ...scope, ctg9: true } as never, earlier.reservationId, {}, now);
  });

  it('blocks, consumes, reconciles, and reads reservation consumption through the durable API', async () => {
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange(range);
    const reservation = await store.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-a', entityType: 'citation', requestedSize: 2,
    }, now, now);
    const reconciled = await store.reconcileNumberingReservation(scope, reservation.reservationId, { claimedNumbers: [10] }, now);
    expect(reconciled).toMatchObject({ missingOnServer: [10], unexpectedOnServer: [] });
    await expect(store.blockNumberingReservation(scope, reservation.reservationId, {}, now)).resolves.toMatchObject({ status: 'blocked' });
    await expect(store.getNumberingConsumption(scope, reservation.reservationId)).resolves.toMatchObject({
      consumption: [{ status: 'claimed-locally' }, { status: 'blocked' }],
    });
    await expect(store.closeNumberingReservation(scope, reservation.reservationId, {}, now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RESERVATION_STATE' });

    const other = await store.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-b', entityType: 'citation', requestedSize: 1,
    }, now, now);
    await expect(store.settleNumberingReservation(scope, other.reservationId, {}, now)).resolves.toMatchObject({ status: 'consumed' });

    const closeStore = new InMemoryOfflineSyncStore();
    closeStore.seedNumberingRange(range);
    const toClose = await closeStore.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'shift-close', entityType: 'citation', requestedSize: 2,
    }, now, now);
    await expect(closeStore.closeNumberingReservation(scope, toClose.reservationId, {}, now)).resolves.toMatchObject({ status: 'consumed' });
    await expect(closeStore.getNumberingConsumption(scope, toClose.reservationId)).resolves.toMatchObject({
      consumption: [{ status: 'expired' }, { status: 'expired' }],
    });
  });

  it('supports conflict resolution ports, stored permissions, fallback permissions, and fail-closed results', async () => {
    const store = new InMemoryOfflineSyncStore();
    const legacy = item('legacy');
    await store.submitSyncBatch(scope, { orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'legacy-batch', items: [legacy] }, now);
    const conflict = await store.openConflict(scope, legacy.queueItemId, { conflictType: 'version', description: 'stale' }, now);
    const resolve = vi.fn(async (_trx, id, action) => ({ ...conflict, conflictId: id, status: 'resolved' as const, resolution: action }));
    const allowedActions = vi.fn(async () => ['device-wins'] as const);
    const port: OfflineSyncConflictResolver = { resolve, allowedActions };
    await expect(store.resolveWithPort(scope, conflict.conflictId, { resolution: 'device-wins' }, now, port))
      .resolves.toMatchObject({ status: 'resolved', resolution: 'device-wins', resolvedBy: scope.actorId, resolvedAt: now });
    expect(allowedActions).toHaveBeenCalledOnce();
    await expect(store.resolveWithPort(scope, conflict.conflictId, { resolution: 'device-wins' }, now, port))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE' });
    await expect(store.resolveWithPort(scope, 'missing', { resolution: 'server-wins' }, now, port))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_NOT_FOUND' });

    const second = await store.openConflict(scope, legacy.queueItemId, { conflictType: 'version', description: 'again' }, now);
    // ADR-MOBILE-OFFLINE-0003 D2: an `open` result is recorded and keeps the conflict open; any other status is refused.
    await expect(store.resolveWithPort(scope, second.conflictId, { resolution: 'manual-review' }, now, {
      resolve: async () => ({ ...second, status: 'open', resolution: 'manual-review', resolvedAt: now }),
    })).resolves.toEqual({ ...second, status: 'open' });
    expect((await store.listSyncConflictActions(scope, { conflictId: second.conflictId })).items).toMatchObject([{ action: 'manual-review', resultingStatus: 'open', actorId: scope.actorId }]);
    await expect(store.resolveWithPort(scope, second.conflictId, { resolution: 'server-wins' }, now, {
      resolve: async () => ({ ...second, status: 'closed' as never }),
    })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
    await expect(store.resolveWithPort(scope, second.conflictId, { resolution: 'server-wins' }, now, {
      allowedActions: async () => ['device-wins'], resolve: resolve as never,
    })).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_RESOLUTION' });
  });

  it('validates CTG9 identity input and configuration before creating receipts', async () => {
    const store = new InMemoryOfflineSyncStore();
    await expect(store.submitDurableSyncBatch(scope, batch('unsafe-number', [item('n', { reservedNumber: 1.25 })]), options(), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(store.submitDurableSyncBatch(scope, batch('reserved-namespace', [item('x', { idempotencyKey: 'stynx:legacy:reserved' })]), options(), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(store.submitDurableSyncBatch(scope, batch('empty-legacy', [item('legacy', { idempotencyKey: undefined })]), options({
      ports: { legacyItemIdentityResolver: { resolve: async () => '' } },
    }), now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(store.submitDurableSyncBatch(scope, batch('duplicate-identities', [item('a', { idempotencyKey: 'same' }), item('b', { idempotencyKey: 'same' })]), options(), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(store.submitDurableSyncBatch(scope, batch('needs-applier', [item('numbered', { reservedNumber: 10 })]), options(), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
    await expect(store.submitDurableSyncBatch(scope, batch('needs-event-port'), options({
      ports: { itemApplier: { apply: async () => ({ serverEntityId: 'server-a' }) } },
    }), now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFIGURATION_ERROR' });
  });

  it('applies a durable batch, writes replay headers, and replays its stable response', async () => {
    const store = new InMemoryOfflineSyncStore();
    const itemApplier = { apply: vi.fn(async () => ({ serverEntityId: 'server-a' })) };
    const eventPort = { appendInTransaction: vi.fn(async () => undefined), appendManyInTransaction: vi.fn(async () => undefined) };
    const response = { status: vi.fn(), setHeader: vi.fn(), getHeaders: () => ({ 'content-type': 'application/json', 'set-cookie': 'session=x' }) };
    const opts = options({ ports: { itemApplier, eventPort }, transport: {
      transportIdempotencyKey: 'transport-key', method: 'POST', path: '/sync/batch', response,
    } });
    const input = batch('receipt-a');
    const first = await store.submitDurableSyncBatch(scope, input, opts, now);
    expect(first.items[0]).toMatchObject({ status: 'applied' });
    expect(eventPort.appendInTransaction).toHaveBeenCalledOnce();
    expect(first.receipt.responseHeaders).toEqual({ 'content-type': 'application/json', 'set-cookie': 'session=x' });
    expect(await store.getSyncBatchReceipt(scope, input.deviceId, input.deviceBatchId)).toMatchObject({
      status: 'closed', responseStatus: 201, responseHeaders: first.receipt.responseHeaders,
    });
    expect(await store.getSyncItemReceipt(scope, 'key-item-a')).toMatchObject({ status: 'applied' });

    const replayResponse = { status: vi.fn(), setHeader: vi.fn() };
    const replay = await store.submitDurableSyncBatch(scope, input, options({ ports: { itemApplier, eventPort }, transport: {
      transportIdempotencyKey: 'transport-key', method: 'POST', path: '/sync/batch', response: replayResponse,
    } }), now);
    expect(replay).toBe(first);
    expect(itemApplier.apply).toHaveBeenCalledOnce();
    expect(replayResponse.status).toHaveBeenCalledWith(201);
    expect(replayResponse.setHeader).toHaveBeenCalledWith('content-type', 'application/json');
  });

  it('retains retryable legacy results and returns in-progress for a leased duplicate batch', async () => {
    const store = new InMemoryOfflineSyncStore();
    const opts = options({ ports: { legacyItemIdentityResolver: { resolve: async () => 'stable-legacy-id' } } });
    const input = batch('retryable', [item('legacy', { idempotencyKey: undefined })]);
    const first = await store.submitDurableSyncBatch(scope, input, opts, now);
    expect(first.items[0]).toMatchObject({ status: 'received' });
    expect(first.receipt.items[0]).toMatchObject({ errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' });
    await expect(store.submitDurableSyncBatch(scope, input, opts, now)).resolves.toMatchObject({ receipt: { status: 'closed' } });

    const leaseStore = new InMemoryOfflineSyncStore();
    let resolveApply!: (value: { serverEntityId: string }) => void;
    const applyPromise = new Promise<{ serverEntityId: string }>(resolve => { resolveApply = resolve; });
    const applying = leaseStore.submitDurableSyncBatch(scope, batch('lease', [item('leased')]), options({
      ports: { itemApplier: { apply: () => applyPromise }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined }, leaseWaitMs: 0 },
    }), now);
    await Promise.resolve();
    await expect(leaseStore.submitDurableSyncBatch(scope, batch('lease', [item('leased')]), options({
      ports: { itemApplier: { apply: async () => ({ serverEntityId: 'duplicate' }) }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined }, leaseWaitMs: 0 },
    }), now)).rejects.toMatchObject({ code: 'OFFLINE_SYNC:BATCH:in-progress' });
    resolveApply({ serverEntityId: 'server-lease' });
    await expect(applying).resolves.toMatchObject({ items: [{ status: 'applied' }] });

    const resolvingStore = new InMemoryOfflineSyncStore();
    let resolveQuick!: (value: { serverEntityId: string }) => void;
    const quickPromise = new Promise<{ serverEntityId: string }>(resolve => { resolveQuick = resolve; });
    const sameInput = batch('lease-resolves', [item('lease-resolves-item')]);
    const original = resolvingStore.submitDurableSyncBatch(scope, sameInput, options({
      ports: { itemApplier: { apply: () => quickPromise }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined } },
    }), now);
    await Promise.resolve();
    const waitingReplay = resolvingStore.submitDurableSyncBatch(scope, sameInput, options({
      ports: { itemApplier: { apply: async () => ({ serverEntityId: 'duplicate' }) }, eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined } },
    }), now);
    resolveQuick({ serverEntityId: 'server-quick' });
    const [originalResult, replayResult] = await Promise.all([original, waitingReplay]);
    expect(replayResult).toBe(originalResult);
  });

  it('reconciles CTG9 submissions against legacy rows and reports integrity or queue-ID reuse', async () => {
    const store = new InMemoryOfflineSyncStore();
    const legacy = item('legacy-row', { idempotencyKey: 'shared-key' });
    await store.submitSyncBatch(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'old-batch', items: [legacy],
    }, now);
    const received = await store.submitDurableSyncBatch(scope, batch('new-batch', [item('new-queue', { idempotencyKey: 'shared-key' })]), options(), now);
    expect(received).toMatchObject({ duplicateItems: 1, items: [{ status: 'rejected', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED', context: { originalQueueItemId: 'legacy-row' } }] });
    const sameQueue = await store.submitDurableSyncBatch(scope, batch('same-legacy-queue', [item('legacy-row', { idempotencyKey: 'shared-key' })]), options({ transportIdempotencyKey: 'same-legacy-transport' }), now);
    expect(sameQueue).toMatchObject({ items: [{ status: 'rejected', errorCode: 'OFFLINE_SYNC_LEGACY_ITEM_NOT_APPLIED' }] });

    const appliedStore = new InMemoryOfflineSyncStore();
    // A stored legacy row always carries a canonical hash (the PostgreSQL CHECK admits nothing else).
    const appliedDigest = `sha256:${'d'.repeat(64)}`;
    const another = item('another-legacy', { idempotencyKey: 'applied-key', payloadHash: appliedDigest });
    await appliedStore.submitSyncBatch(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'applied-old', items: [another],
    }, now);
    const conflict = await appliedStore.openConflict(scope, 'another-legacy', { conflictType: 'version', description: 'resolve' }, now);
    await appliedStore.resolveConflict(scope, conflict.conflictId, { resolution: 'device-wins' }, now);
    const appliedReplay = await appliedStore.submitDurableSyncBatch(scope, batch('applied-new', [item('renamed-queue', { idempotencyKey: 'applied-key', payloadHash: appliedDigest })]), options(), now);
    expect(appliedReplay).toMatchObject({ duplicateItems: 1, items: [{ status: 'applied', context: { originalQueueItemId: 'another-legacy' } }] });
    const appliedSameQueue = await appliedStore.submitDurableSyncBatch(scope, batch('applied-same-queue', [item('another-legacy', { idempotencyKey: 'applied-key', payloadHash: appliedDigest })]), options({ transportIdempotencyKey: 'applied-same-queue-transport' }), now);
    expect(appliedSameQueue).toMatchObject({ items: [{ status: 'applied' }] });

    const changedPayload = { value: 2 };
    const changedHash = `sha256:${createHash('sha256').update(JSON.stringify(changedPayload)).digest('hex')}`;
    const integrity = await appliedStore.submitDurableSyncBatch(scope, batch('integrity-new', [item('tampered-queue', {
      idempotencyKey: 'applied-key', payloadHash: changedHash, payloadJson: changedPayload,
    })]), options({ transportIdempotencyKey: 'integrity-transport' }), now);
    expect(integrity).toMatchObject({ items: [{ status: 'rejected', errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY' }] });

    const first = await store.submitDurableSyncBatch(scope, batch('reuse-a', [item('same-queue')]), options({ transportIdempotencyKey: 'reuse-a-transport' }), now);
    expect(first.items[0]).toMatchObject({ status: 'received' });
    const reused = await store.submitDurableSyncBatch(scope, batch('reuse-b', [item('same-queue', { idempotencyKey: 'different-key' })]), options({ transportIdempotencyKey: 'reuse-transport' }), now);
    expect(reused.items[0]).toMatchObject({ status: 'rejected', errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED' });
  });

  it('retries a received item with stable content after a retryable applier error', async () => {
    const store = new InMemoryOfflineSyncStore();
    const eventPort = { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined };
    const input = batch('retry-same-batch');
    const first = await store.submitDurableSyncBatch(scope, input, options({
      ports: { itemApplier: { apply: async () => { throw new Error('temporary outage'); } }, eventPort },
    }), now);
    expect(first).toMatchObject({ receipt: { status: 'open', responseStatus: null }, items: [{ status: 'received' }] });
    const second = await store.submitDurableSyncBatch(scope, input, options({
      ports: { itemApplier: { apply: async () => ({ serverEntityId: 'server-retry' }) }, eventPort },
    }), now);
    expect(second).toMatchObject({ receipt: { status: 'closed', responseStatus: 201 }, items: [{ status: 'applied' }] });

    const crossBatchStore = new InMemoryOfflineSyncStore();
    const commonItem = item('cross-batch-item', { idempotencyKey: 'shared-idempotency' });
    await crossBatchStore.submitDurableSyncBatch(scope, batch('retry-source', [commonItem]), options({
      transportIdempotencyKey: 'retry-source-transport',
      ports: { itemApplier: { apply: async () => { throw new Error('try later'); } }, eventPort },
    }), now);
    const retryAlias = await crossBatchStore.submitDurableSyncBatch(scope, batch('retry-alias', [item('retry-alias-item', { idempotencyKey: 'shared-idempotency' })]), options({
      transportIdempotencyKey: 'retry-alias-transport',
      ports: { itemApplier: { apply: async () => ({ serverEntityId: 'not-called' }) }, eventPort },
    }), now);
    expect(retryAlias).toMatchObject({ receipt: { status: 'open' }, items: [{ status: 'received' }] });
    const sameAlias = await crossBatchStore.submitDurableSyncBatch(scope, batch('retry-same-id-alias', [item('cross-batch-item', { idempotencyKey: 'shared-idempotency' })]), options({
      transportIdempotencyKey: 'retry-same-alias-transport',
      ports: { itemApplier: { apply: async () => ({ serverEntityId: 'not-called' }) }, eventPort },
    }), now);
    expect(sameAlias).toMatchObject({ receipt: { status: 'open' }, items: [{ status: 'received' }] });
  });

  it('rejects batch context and transport-key reuse while enforcing per-device sequence order', async () => {
    const store = new InMemoryOfflineSyncStore();
    const firstInput = batch('transport-a', [item('transport-a-item')], { batchSequence: 1 });
    const sameBody = { transportIdempotencyKey: 'transport-a-key', requestBody: { stable: true } };
    await store.submitDurableSyncBatch(scope, firstInput, options(sameBody), now);
    await expect(store.submitDurableSyncBatch(scope, batch('transport-a', [item('changed', { payloadHash: `${digest}-other` })], { batchSequence: 1 }), options(sameBody), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });

    await expect(store.submitDurableSyncBatch(scope, batch('sequence-duplicate', [item('duplicate-sequence')], { batchSequence: 1 }), options({ transportIdempotencyKey: 'sequence-dup' }), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    await expect(store.submitDurableSyncBatch(scope, batch('sequence-gap', [item('gap-sequence')], { batchSequence: 3 }), options({ transportIdempotencyKey: 'sequence-gap' }), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_SEQUENCE' });
    await store.submitDurableSyncBatch(scope, batch('sequence-two', [item('sequence-two')], { batchSequence: 2 }), options({ transportIdempotencyKey: 'sequence-two' }), now);

    await expect(store.submitDurableSyncBatch(scope, batch('transport-b', [item('transport-b-item')]), options(sameBody), now))
      .rejects.toMatchObject({ status: 409 });

    const boundStore = new InMemoryOfflineSyncStore();
    const request = { requestBody: { same: 'request' } };
    await boundStore.submitDurableSyncBatch(scope, batch('first', [item('first-item')]), options({ ...request, transportIdempotencyKey: 'first-key' }), now);
    await boundStore.submitDurableSyncBatch(scope, batch('second', [item('second-item')]), options({ ...request, transportIdempotencyKey: 'second-key' }), now);
    await expect(boundStore.submitDurableSyncBatch(scope, batch('first', [item('first-item')]), options({ ...request, transportIdempotencyKey: 'second-key' }), now))
      .rejects.toMatchObject({ code: 'OFFLINE_SYNC_BATCH_CONFLICT' });
    await expect(boundStore.submitDurableSyncBatch(scope, batch('first', [item('first-item')]), options({
      transportIdempotencyKey: 'second-key', requestBody: { different: 'request' },
    }), now)).rejects.toMatchObject({ status: 422 });

    const nullSequenceStore = new InMemoryOfflineSyncStore();
    await nullSequenceStore.submitDurableSyncBatch(scope, batch('no-sequence', [item('no-sequence-item')]), options({ transportIdempotencyKey: 'no-sequence-transport' }), now);
    await expect(nullSequenceStore.submitDurableSyncBatch(scope, batch('sequence-one', [item('sequence-one-item')], { batchSequence: 1 }), options({ transportIdempotencyKey: 'sequence-one-transport' }), now))
      .resolves.toMatchObject({ receipt: { batchSequence: 1 } });
  });

  it('uses durable option defaults and treats absent batch/item receipts as empty', async () => {
    const store = new InMemoryOfflineSyncStore();
    await expect(store.getSyncBatchReceipt(scope, 'device-a', 'missing')).resolves.toStrictEqual(null);
    await expect(store.getSyncItemReceipt(scope, 'missing')).resolves.toStrictEqual(null);
    const sparse = { method: 'POST', path: '/sync/batch' } as unknown as DurableBatchExecutionOptions;
    await expect(store.submitDurableSyncBatch(scope, batch('sparse'), sparse, now)).resolves.toMatchObject({ items: [{ status: 'received' }] });
  });

  it('handles suspected and clear concurrency results across stored, current, and unrelated items', async () => {
    const store = new InMemoryOfflineSyncStore();
    const applier = { apply: async () => ({ serverEntityId: 'server-a' }) };
    const eventPort = { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined };
    await store.submitDurableSyncBatch(scope, batch('seed-concurrency', [item('seed-item')]), options({
      transportIdempotencyKey: 'seed-transport', ports: { itemApplier: applier, eventPort },
    }), now);
    const detector = { detect: vi.fn(async () => ({
      suspected: true, pairs: [{ firstItemId: 'seed-item', secondItemId: 'current-item' }],
    })) };
    const conflictBatch = await store.submitDurableSyncBatch(scope, batch('concurrency-current', [item('current-item')]), options({
      transportIdempotencyKey: 'current-transport', policy: { concurrencyWindowMinutes: 10 },
      ports: { itemApplier: applier, eventPort, concurrencyDetector: detector },
    }), now);
    expect(conflictBatch.items[0]).toMatchObject({ status: 'conflict' });

    const unrelated = await store.submitDurableSyncBatch(scope, batch('concurrency-unrelated', [item('unrelated-current')]), options({
      transportIdempotencyKey: 'unrelated-transport', policy: { concurrencyWindowMinutes: 10 },
      ports: { itemApplier: applier, eventPort, concurrencyDetector: {
        detect: async () => ({ suspected: true, pairs: [{ firstItemId: 'outside-a', secondItemId: 'outside-b' }] }),
      } },
    }), now);
    expect(unrelated.items[0]).toMatchObject({ status: 'applied' });
    expect(await store.getSyncItemReceipt(scope, 'key-seed-item')).toMatchObject({ status: 'conflict' });

    const clear = await store.submitDurableSyncBatch(scope, batch('concurrency-clear', [item('clear-current')]), options({
      transportIdempotencyKey: 'clear-transport', policy: { concurrencyWindowMinutes: 10 },
      ports: { itemApplier: applier, eventPort, concurrencyDetector: { detect: async () => ({ suspected: false, pairs: [] }) } },
    }), now);
    expect(clear.items[0]).toMatchObject({ status: 'applied' });
  });

  it('records successful reserved-number applications in the consumption ledger', async () => {
    const store = new InMemoryOfflineSyncStore();
    store.seedNumberingRange(range);
    const reservation = await store.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'apply', entityType: 'citation', requestedSize: 1,
    }, now, '2026-09-30T12:00:00.000Z');
    const reserved = item('numbered', { reservedNumber: reservation.startNumber, reservationId: reservation.reservationId });
    await store.submitDurableSyncBatch(scope, batch('apply-number', [reserved]), options({
      ports: {
        itemApplier: { apply: async () => ({ serverEntityId: 'server-numbered' }) },
        eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
      },
    }), now);
    await expect(store.getNumberingConsumption(scope, reservation.reservationId)).resolves.toMatchObject({
      consumption: [{ status: 'applied', serverEntityId: 'server-numbered', finalizedAt: now }],
    });
    await expect(store.reconcileNumberingReservation(scope, reservation.reservationId, {}, now)).resolves.toMatchObject({
      missingOnServer: [], unexpectedOnServer: [reservation.startNumber],
    });

    const blockedStore = new InMemoryOfflineSyncStore();
    blockedStore.seedNumberingRange(range);
    const blockedReservation = await blockedStore.reserveNumbering(scope, {
      orgUnitId: 'org-a', deviceId: 'device-a', shiftId: 'blocked-apply', entityType: 'citation', requestedSize: 1,
    }, now, '2026-09-30T12:00:00.000Z');
    await blockedStore.blockNumberingReservation(scope, blockedReservation.reservationId, {}, now);
    const rejected = await blockedStore.submitDurableSyncBatch(scope, batch('blocked-number', [item('blocked-number-item', {
      reservedNumber: blockedReservation.startNumber, reservationId: blockedReservation.reservationId,
    })]), options({ ports: {
      itemApplier: { apply: async () => ({ serverEntityId: 'must-not-apply' }) },
      eventPort: { appendInTransaction: async () => undefined, appendManyInTransaction: async () => undefined },
    } }), now);
    expect(rejected).toMatchObject({ items: [{ status: 'conflict' }], receipt: { items: [{ errorCode: 'OFFLINE_SYNC_NUMBERING_EXPIRED' }] } });
  });
});
