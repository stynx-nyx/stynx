import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import { StynxOfflineSyncContext } from '../../src/stynx-offline-sync.context';
import type {
  OfflineSyncStore,
  SyncBatchItemInput,
  TrustedOfflineSyncScope,
} from '../../src/types';

const tenantId = '00000000-0000-4000-8000-000000000001';
const scope: TrustedOfflineSyncScope = { tenantId, actorId: 'agent-a' };
const now = '2026-08-25T12:00:00.000Z';
const validItem: SyncBatchItemInput = {
  queueItemId: 'queue-1',
  entityType: 'record',
  localEntityId: 'local-1',
  idempotencyKey: 'idem-1',
  payloadHash: `sha256:${'a'.repeat(64)}`,
  payloadJson: { value: 1 },
  createdLocallyAt: now,
};

function seed(store: InMemoryOfflineSyncStore, overrides: Record<string, unknown> = {}) {
  store.seedNumberingRange({
    id: '10000000-0000-4000-8000-000000000001',
    tenantId,
    orgUnitId: 'org-a',
    entityType: 'record',
    series: 'REC',
    startNumber: 1,
    endNumber: 5,
    nextNumber: 1,
    status: 'active',
    ...overrides,
  });
}

function serviceHarness() {
  const store: OfflineSyncStore = {
    reserveNumbering: vi.fn(async () => ({}) as never),
    cancelNumberingReservation: vi.fn(async () => ({}) as never),
    submitSyncBatch: vi.fn(async () => ({}) as never),
    openConflict: vi.fn(async () => ({}) as never),
    resolveConflict: vi.fn(async () => ({}) as never),
  };
  return {
    store,
    service: new OfflineSyncService(
      store,
      { current: () => scope },
      {
        now: () => now,
        reservationTtlMs: 60_000,
      },
    ),
  };
}

describe('StynxOfflineSyncContext', () => {
  it('returns trusted tenant and actor identity', () => {
    const context = new StynxOfflineSyncContext({
      get: () => ({ tenantId, actorId: scope.actorId }),
    } as never);
    expect(context.current()).toEqual(scope);
  });

  it.each([
    [
      {
        get: () => {
          throw new Error('outside request');
        },
      },
      'OFFLINE_SYNC_UNAUTHENTICATED',
    ],
    [{ get: () => ({ tenantId }) }, 'OFFLINE_SYNC_UNAUTHENTICATED'],
    [{ get: () => ({ actorId: scope.actorId }) }, 'OFFLINE_SYNC_FORBIDDEN'],
  ])('fails closed for absent trusted context %#', (moduleRef, code) => {
    expect(() => new StynxOfflineSyncContext(moduleRef as never).current()).toThrow(
      expect.objectContaining({ code }),
    );
  });
});

describe('OfflineSyncService validation depth', () => {
  it('uses configured and default clocks and TTLs and validates validUntil', async () => {
    const { service, store } = serviceHarness();
    await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
      validUntil: '2026-08-26T00:00:00.000Z',
    });
    expect(store.reserveNumbering).toHaveBeenCalledWith(
      scope,
      expect.any(Object),
      now,
      '2026-08-25T12:01:00.000Z',
    );

    const defaultClockStore = { ...store, reserveNumbering: vi.fn(async () => ({}) as never) };
    await new OfflineSyncService(defaultClockStore, { current: () => scope }, {}).reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
    });
    expect(defaultClockStore.reserveNumbering).toHaveBeenCalledWith(
      scope,
      expect.any(Object),
      expect.any(String),
      expect.any(String),
    );

    await expect(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'record',
        requestedSize: 1,
        validUntil: now,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it.each([NaN, 0, 101, 1.5])('rejects invalid reservation size %s', async (requestedSize) => {
    await expect(
      serviceHarness().service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'record',
        requestedSize,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it('rejects long cancellation reasons and forwards the default empty input', async () => {
    const { service, store } = serviceHarness();
    await expect(
      service.cancelNumberingReservation('reservation-1', { reason: 'x'.repeat(501) }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await service.cancelNumberingReservation('reservation-1');
    expect(store.cancelNumberingReservation).toHaveBeenCalledWith(scope, 'reservation-1', {}, now);
  });

  it.each([
    [{ ...validItem, createdLocallyAt: 'not-a-date' }, 'createdLocallyAt'],
    [{ ...validItem, payloadJson: null }, 'payloadJson'],
    [{ ...validItem, payloadJson: 'bad' }, 'payloadJson'],
    [{ ...validItem, payloadJson: [] }, 'payloadJson'],
  ])('rejects malformed queue item input %#', async (candidate) => {
    await expect(
      serviceHarness().service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [candidate as never],
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it('rejects duplicate queue ids and excessive batch cardinality', async () => {
    const { service } = serviceHarness();
    await expect(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [validItem, validItem],
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: Array.from({ length: 101 }, (_, index) => ({
          ...validItem,
          queueItemId: `q-${index}`,
        })),
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: null as never,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it('rejects invalid conflict resolutions, overlong entity types, and missing text', async () => {
    const { service } = serviceHarness();
    await expect(
      service.resolveConflict('conflict-1', { resolution: 'unknown' as never }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'x'.repeat(101),
        requestedSize: 1,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.openConflict('', { conflictType: 'version', description: 'different' }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.openConflict('queue-1', { conflictType: ' ', description: 'different' }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.openConflict('queue-1', { conflictType: 'version', description: null as never }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });
});

describe('InMemoryOfflineSyncStore fail-closed behavior', () => {
  it('selects a range by id and rejects missing, mismatched, inactive, and insufficient ranges', async () => {
    const store = new InMemoryOfflineSyncStore();
    seed(store);
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
    };
    await expect(
      store.reserveNumbering(scope, { ...input, rangeId: 'missing' }, now, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });
    for (const overrides of [
      { status: 'cancelled' },
      { orgUnitId: 'other' },
      { entityType: 'other' },
      { nextNumber: 5 },
    ]) {
      const isolated = new InMemoryOfflineSyncStore();
      seed(isolated, overrides);
      await expect(
        isolated.reserveNumbering(
          scope,
          {
            ...input,
            requestedSize: 2,
            rangeId: rangeRowId(isolated),
          },
          now,
          now,
        ),
      ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_UNAVAILABLE' });
    }
  });

  it('rejects missing reservations, queue items, conflicts, and repeated conflict resolution', async () => {
    const store = new InMemoryOfflineSyncStore();
    await expect(store.cancelNumberingReservation(scope, 'missing', {}, now)).rejects.toMatchObject(
      { code: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND' },
    );
    await expect(
      store.openConflict(
        scope,
        'missing',
        { conflictType: 'version', description: 'different' },
        now,
      ),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND' });
    await expect(
      store.resolveConflict(scope, 'missing', { resolution: 'device-wins' }, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_NOT_FOUND' });

    await store.submitSyncBatch(
      scope,
      {
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [validItem],
      },
      now,
    );
    const conflict = await store.openConflict(
      scope,
      validItem.queueItemId,
      {
        conflictType: 'version',
        description: 'different',
      },
      now,
    );
    await store.resolveConflict(
      scope,
      conflict.conflictId,
      {
        resolution: 'manual-review',
        description: 'reviewed',
      },
      now,
    );
    await expect(
      store.resolveConflict(scope, conflict.conflictId, { resolution: 'device-wins' }, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_CONFLICT_STATE' });
  });

  it('handles a stale payload index and a conflict whose queue item disappeared', async () => {
    const store = new InMemoryOfflineSyncStore();
    await store.submitSyncBatch(
      scope,
      {
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [validItem],
      },
      now,
    );
    (store as unknown as { queueItems: Map<string, unknown> }).queueItems.delete(
      `${tenantId}:${validItem.queueItemId}`,
    );
    const replay = await store.submitSyncBatch(
      scope,
      {
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-b',
        items: [{ ...validItem, queueItemId: 'queue-replacement' }],
      },
      now,
    );
    expect(replay.duplicateItems).toBe(0);

    const conflict = await store.openConflict(
      scope,
      'queue-replacement',
      {
        conflictType: 'version',
        description: 'different',
      },
      now,
    );
    (store as unknown as { queueItems: Map<string, unknown> }).queueItems.delete(
      `${tenantId}:queue-replacement`,
    );
    await expect(
      store.resolveConflict(scope, conflict.conflictId, { resolution: 'device-wins' }, now),
    ).resolves.toMatchObject({ description: 'different', status: 'resolved' });
  });
});

function rangeRowId(_store: InMemoryOfflineSyncStore): string {
  return '10000000-0000-4000-8000-000000000001';
}
