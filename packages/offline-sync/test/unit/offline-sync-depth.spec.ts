import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncError } from '../../src/errors';
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

async function expectInvalid(promise: Promise<unknown>, message: string) {
  const error = await promise.catch((candidate: unknown) => candidate);
  expect(error).toBeInstanceOf(OfflineSyncError);
  expect(error).toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  expect((error as OfflineSyncError).getStatus()).toBe(400);
  expect((error as OfflineSyncError).getResponse()).toEqual({
    statusCode: 400,
    errorCode: 'OFFLINE_SYNC_INVALID_INPUT',
    message,
    retryable: false,
  });
}

describe('OfflineSyncError response contract', () => {
  it('preserves status, code, message, and non-retryable response fields', () => {
    const error = new OfflineSyncError('OFFLINE_SYNC_RANGE_UNAVAILABLE', 409, 'No capacity.');
    expect(error.code).toBe('OFFLINE_SYNC_RANGE_UNAVAILABLE');
    expect(error.getStatus()).toBe(409);
    expect(error.message).toBe('No capacity.');
    expect(error.getResponse()).toEqual({
      statusCode: 409,
      errorCode: 'OFFLINE_SYNC_RANGE_UNAVAILABLE',
      message: 'No capacity.',
      retryable: false,
    });
  });
});

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
  it('forwards the exact trusted scope, input, time, TTL, and conflict arguments', async () => {
    const { service, store } = serviceHarness();
    const reserveInput = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 100,
      rangeId: 'range-a',
      series: 'REC',
      validUntil: '2026-08-26T00:00:00.000Z',
    };
    await service.reserveNumbering(reserveInput);
    expect(store.reserveNumbering).toHaveBeenCalledTimes(1);
    expect(store.reserveNumbering).toHaveBeenLastCalledWith(
      scope,
      reserveInput,
      now,
      '2026-08-25T12:01:00.000Z',
    );

    const cancelInput = { reason: 'operator cancelled' };
    await service.cancelNumberingReservation('reservation-a', cancelInput);
    expect(store.cancelNumberingReservation).toHaveBeenCalledTimes(1);
    expect(store.cancelNumberingReservation).toHaveBeenLastCalledWith(
      scope,
      'reservation-a',
      cancelInput,
      now,
    );

    const batchInput = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [validItem],
    };
    await service.submitSyncBatch(batchInput);
    expect(store.submitSyncBatch).toHaveBeenCalledTimes(1);
    expect(store.submitSyncBatch).toHaveBeenLastCalledWith(scope, batchInput, now);

    const openInput = { conflictType: 'version', description: 'different' };
    await service.openConflict('queue-1', openInput);
    expect(store.openConflict).toHaveBeenCalledTimes(1);
    expect(store.openConflict).toHaveBeenLastCalledWith(scope, 'queue-1', openInput, now);

    const resolveInput = { resolution: 'manual-review' as const, description: 'reviewed' };
    await service.resolveConflict('conflict-1', resolveInput);
    expect(store.resolveConflict).toHaveBeenCalledTimes(1);
    expect(store.resolveConflict).toHaveBeenLastCalledWith(scope, 'conflict-1', resolveInput, now);
  });

  it('uses the exact 24-hour default TTL when no reservation TTL is configured', async () => {
    const { store } = serviceHarness();
    const reserveNumbering = vi.fn(async () => ({}) as never);
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
    };
    await new OfflineSyncService(
      { ...store, reserveNumbering },
      { current: () => scope },
      { now: () => now },
    ).reserveNumbering(input);
    expect(reserveNumbering).toHaveBeenCalledWith(scope, input, now, '2026-08-26T12:00:00.000Z');
  });

  it('accepts exact upper validation boundaries and rejects their immediate successors', async () => {
    const { service, store } = serviceHarness();
    await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'x'.repeat(100),
      requestedSize: 100,
    });
    await service.cancelNumberingReservation('reservation-1', { reason: 'x'.repeat(500) });
    await service.submitSyncBatch({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: Array.from({ length: 100 }, (_, index) => ({
        ...validItem,
        queueItemId: `queue-${index}`,
        idempotencyKey: `idem-${index}`,
        payloadHash: `sha256:${index.toString(16).padStart(64, '0')}`,
      })),
    });
    expect(store.reserveNumbering).toHaveBeenCalledTimes(1);
    expect(store.cancelNumberingReservation).toHaveBeenCalledTimes(1);
    expect(store.submitSyncBatch).toHaveBeenCalledTimes(1);

    await expectInvalid(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'record',
        requestedSize: 101,
      }),
      'requestedSize must be an integer between 1 and 100.',
    );
    await expectInvalid(
      service.cancelNumberingReservation('reservation-1', { reason: 'x'.repeat(501) }),
      'reason must not exceed 500 characters.',
    );
  });

  it.each([
    ['orgUnitId', { orgUnitId: ' ' }, 'orgUnitId is required.'],
    ['deviceId', { deviceId: '' }, 'deviceId is required.'],
    ['shiftId', { shiftId: null }, 'shiftId is required.'],
    ['entityType', { entityType: 'x'.repeat(101) }, 'entityType must not exceed 100 characters.'],
  ])('rejects the exact reservation %s boundary', async (_field, override, message) => {
    await expectInvalid(
      serviceHarness().service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'record',
        requestedSize: 1,
        ...override,
      } as never),
      message,
    );
  });

  it.each([
    ['queueItemId', { queueItemId: ' ' }, 'queueItemId is required.'],
    ['entityType', { entityType: '' }, 'entityType is required.'],
    ['localEntityId', { localEntityId: null }, 'localEntityId is required.'],
    ['idempotencyKey', { idempotencyKey: ' ' }, 'idempotencyKey is required.'],
    [
      'payloadHash',
      { payloadHash: `sha256:${'A'.repeat(64)}` },
      'payloadHash must be a canonical sha256-prefixed hexadecimal digest.',
    ],
    [
      'createdLocallyAt',
      { createdLocallyAt: 'invalid' },
      'createdLocallyAt must be an ISO-8601 timestamp.',
    ],
    ['payloadJson', { payloadJson: [] }, 'payloadJson must be an object.'],
  ])('rejects the exact queue-item %s boundary', async (_field, override, message) => {
    await expectInvalid(
      serviceHarness().service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [{ ...validItem, ...override } as never],
      }),
      message,
    );
  });

  it('reports exact duplicate, time, and conflict validation failures', async () => {
    const { service } = serviceHarness();
    await expectInvalid(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [validItem, validItem],
      }),
      'queueItemId queue-1 appears more than once in the batch.',
    );
    await expectInvalid(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'record',
        requestedSize: 1,
        validUntil: now,
      }),
      'validUntil must be later than the current time.',
    );
    await expectInvalid(
      service.resolveConflict('conflict-1', { resolution: 'unknown' as never }),
      'resolution must be device-wins, server-wins or manual-review.',
    );
  });

  it('reports every required method-boundary field and batch-cardinality failure', async () => {
    const { service } = serviceHarness();
    await expectInvalid(service.cancelNumberingReservation(''), 'reservationId is required.');
    await expectInvalid(
      service.submitSyncBatch({
        orgUnitId: '',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [validItem],
      }),
      'orgUnitId is required.',
    );
    await expectInvalid(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: '',
        deviceBatchId: 'batch-a',
        items: [validItem],
      }),
      'deviceId is required.',
    );
    await expectInvalid(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: '',
        items: [validItem],
      }),
      'deviceBatchId is required.',
    );
    await expectInvalid(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'batch-a',
        items: [],
      }),
      'items must contain between 1 and 100 queue items.',
    );
    await expectInvalid(
      service.openConflict('', { conflictType: 'version', description: 'different' }),
      'queueItemId is required.',
    );
    await expectInvalid(
      service.openConflict('queue-1', { conflictType: '', description: 'different' }),
      'conflictType is required.',
    );
    await expectInvalid(
      service.openConflict('queue-1', { conflictType: 'version', description: '' }),
      'description is required.',
    );
    await expectInvalid(
      service.resolveConflict('', { resolution: 'manual-review' }),
      'conflictId is required.',
    );
  });

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
  it('discriminates every tenant, id, organization, entity, and series selection branch', async () => {
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
    };
    for (const overrides of [
      { tenantId: '00000000-0000-4000-8000-000000000099' },
      { orgUnitId: 'org-b' },
      { entityType: 'other' },
    ]) {
      const isolated = new InMemoryOfflineSyncStore();
      seed(isolated, overrides);
      await expect(isolated.reserveNumbering(scope, input, now, now)).rejects.toMatchObject({
        code: 'OFFLINE_SYNC_RANGE_NOT_FOUND',
      });
    }

    const differentSeries = new InMemoryOfflineSyncStore();
    seed(differentSeries, { series: 'ALT' });
    await expect(
      differentSeries.reserveNumbering(scope, { ...input, series: 'REC' }, now, now),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_NOT_FOUND' });

    const withoutSeries = new InMemoryOfflineSyncStore();
    seed(withoutSeries, { series: 'ALT' });
    await expect(withoutSeries.reserveNumbering(scope, input, now, now)).resolves.toMatchObject({
      series: 'ALT',
    });

    const explicit = new InMemoryOfflineSyncStore();
    seed(explicit, { series: 'REC' });
    await expect(
      explicit.reserveNumbering(
        scope,
        {
          ...input,
          rangeId: '10000000-0000-4000-8000-000000000001',
          series: 'DIFFERENT',
        },
        now,
        now,
      ),
    ).resolves.toMatchObject({
      rangeId: '10000000-0000-4000-8000-000000000001',
      series: 'REC',
    });
  });

  it('returns exact not-found, capacity, and conflict-state error contracts', async () => {
    const store = new InMemoryOfflineSyncStore();
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
    };
    const rangeError = await store
      .reserveNumbering(scope, input, now, now)
      .catch((error: unknown) => error as OfflineSyncError);
    expect(rangeError.getResponse()).toEqual({
      statusCode: 404,
      errorCode: 'OFFLINE_SYNC_RANGE_NOT_FOUND',
      message: 'No tenant-scoped numbering range matches this entity and organizational unit.',
      retryable: false,
    });

    seed(store, { startNumber: 1, endNumber: 1, nextNumber: 1 });
    const capacityError = await store
      .reserveNumbering(scope, { ...input, requestedSize: 2 }, now, now)
      .catch((error: unknown) => error as OfflineSyncError);
    expect(capacityError.getResponse()).toEqual({
      statusCode: 409,
      errorCode: 'OFFLINE_SYNC_RANGE_UNAVAILABLE',
      message: 'The selected numbering range has insufficient capacity.',
      retryable: false,
    });

    const reservationError = await store
      .cancelNumberingReservation(scope, 'missing', {}, now)
      .catch((error: unknown) => error as OfflineSyncError);
    expect(reservationError.getResponse()).toEqual({
      statusCode: 404,
      errorCode: 'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
      message: 'Numbering reservation missing was not found.',
      retryable: false,
    });

    const queueError = await store
      .openConflict(scope, 'missing', { conflictType: 'version', description: 'different' }, now)
      .catch((error: unknown) => error as OfflineSyncError);
    expect(queueError.getResponse()).toEqual({
      statusCode: 404,
      errorCode: 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
      message: 'Sync queue item missing was not found.',
      retryable: false,
    });

    const conflictError = await store
      .resolveConflict(scope, 'missing', { resolution: 'manual-review' }, now)
      .catch((error: unknown) => error as OfflineSyncError);
    expect(conflictError.getResponse()).toEqual({
      statusCode: 404,
      errorCode: 'OFFLINE_SYNC_CONFLICT_NOT_FOUND',
      message: 'Sync conflict missing was not found.',
      retryable: false,
    });

    await store.submitSyncBatch(
      scope,
      { orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'batch-a', items: [validItem] },
      now,
    );
    const conflict = await store.openConflict(
      scope,
      validItem.queueItemId,
      { conflictType: 'version', description: 'different' },
      now,
    );
    await store.resolveConflict(scope, conflict.conflictId, { resolution: 'manual-review' }, now);
    const stateError = await store
      .resolveConflict(scope, conflict.conflictId, { resolution: 'manual-review' }, now)
      .catch((error: unknown) => error as OfflineSyncError);
    expect(stateError.getResponse()).toEqual({
      statusCode: 409,
      errorCode: 'OFFLINE_SYNC_CONFLICT_STATE',
      message: `Sync conflict ${conflict.conflictId} is resolved; expected open.`,
      retryable: false,
    });
  });

  it('projects public conflict replay state', async () => {
    const store = new InMemoryOfflineSyncStore();
    const batch = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [validItem],
    };
    await store.submitSyncBatch(scope, batch, now);

    const conflict = await store.openConflict(
      scope,
      validItem.queueItemId,
      { conflictType: 'version', description: 'different' },
      now,
    );
    const replay = await store.submitSyncBatch(
      scope,
      {
        ...batch,
        deviceBatchId: 'batch-conflict-replay',
        items: [{ ...validItem, queueItemId: 'queue-replay', idempotencyKey: 'idem-replay' }],
      },
      now,
    );
    expect(replay).toMatchObject({
      acceptedItems: 1,
      duplicateItems: 1,
      conflicts: [validItem.queueItemId],
      items: [{ status: 'conflict' }],
    });
    expect(conflict.status).toBe('open');
  });

  it('returns and advances every reservation field at exact capacity boundaries', async () => {
    const store = new InMemoryOfflineSyncStore();
    seed(store);
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 3,
      series: 'REC',
    };
    const first = await store.reserveNumbering(scope, input, now, '2026-08-25T13:00:00.000Z');
    expect(first).toEqual({
      reservationId: first.reservationId,
      rangeId: '10000000-0000-4000-8000-000000000001',
      tenantId,
      orgUnitId: 'org-a',
      entityType: 'record',
      series: 'REC',
      agentId: 'agent-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      startNumber: 1,
      endNumber: 3,
      nextNumber: 1,
      validUntil: '2026-08-25T13:00:00.000Z',
      status: 'reserved',
    });
    const second = await store.reserveNumbering(
      scope,
      { ...input, requestedSize: 2, validUntil: '2026-08-25T14:00:00.000Z' },
      now,
      'ignored-default',
    );
    expect(second.startNumber).toBe(4);
    expect(second.endNumber).toBe(5);
    expect(second.nextNumber).toBe(4);
    expect(second.validUntil).toBe('2026-08-25T14:00:00.000Z');
    await expect(
      store.reserveNumbering(scope, { ...input, requestedSize: 1 }, now, now),
    ).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_RANGE_UNAVAILABLE',
      response: {
        statusCode: 409,
        errorCode: 'OFFLINE_SYNC_RANGE_UNAVAILABLE',
        message:
          'The selected numbering range is not active for this entity and organizational unit.',
        retryable: false,
      },
    });
  });

  it('selects ranges by tenant, explicit id, organization, entity, and series', async () => {
    const store = new InMemoryOfflineSyncStore();
    seed(store);
    seed(store, {
      id: '10000000-0000-4000-8000-000000000002',
      series: 'ALT',
      startNumber: 20,
      endNumber: 25,
      nextNumber: 20,
    });
    seed(store, {
      id: '10000000-0000-4000-8000-000000000003',
      tenantId: '00000000-0000-4000-8000-000000000099',
      startNumber: 90,
      endNumber: 95,
      nextNumber: 90,
    });
    const base = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'record',
      requestedSize: 1,
    };
    const alt = await store.reserveNumbering(scope, { ...base, series: 'ALT' }, now, now);
    expect(alt.rangeId).toBe('10000000-0000-4000-8000-000000000002');
    expect(alt.startNumber).toBe(20);
    const exact = await store.reserveNumbering(
      scope,
      { ...base, rangeId: '10000000-0000-4000-8000-000000000001' },
      now,
      now,
    );
    expect(exact.rangeId).toBe('10000000-0000-4000-8000-000000000001');
    expect(exact.tenantId).toBe(tenantId);
  });

  it('returns complete batch, replay, and queue identity projections', async () => {
    const store = new InMemoryOfflineSyncStore();
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [validItem],
    };
    const accepted = await store.submitSyncBatch(scope, input, now);
    const expectedItem = {
      ...validItem,
      tenantId,
      agentId: 'agent-a',
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      status: 'received',
      receivedAt: now,
    };
    expect(accepted).toEqual({
      batchId: 'batch-a',
      acceptedItems: 1,
      duplicateItems: 0,
      conflicts: [],
      items: [expectedItem],
    });
    expect(store.getQueueItem(tenantId, 'queue-1')).toEqual(expectedItem);
    expect(store.getQueueItem('other-tenant', 'queue-1')).toBe(undefined);

    const replay = await store.submitSyncBatch(
      scope,
      {
        ...input,
        deviceBatchId: 'batch-replay',
        items: [{ ...validItem, queueItemId: 'queue-2', idempotencyKey: 'idem-2' }],
      },
      '2026-08-25T13:00:00.000Z',
    );
    expect(replay).toEqual({
      batchId: 'batch-replay',
      acceptedItems: 1,
      duplicateItems: 1,
      conflicts: [],
      items: [expectedItem],
    });
  });

  it('preserves complete conflict opening, fallback, override, actor, and time semantics', async () => {
    const store = new InMemoryOfflineSyncStore();
    await store.submitSyncBatch(
      scope,
      { orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'batch-a', items: [validItem] },
      now,
    );
    const conflict = await store.openConflict(
      scope,
      'queue-1',
      { conflictType: 'version', description: 'original' },
      now,
    );
    expect(conflict).toEqual({
      conflictId: conflict.conflictId,
      tenantId,
      queueItemId: 'queue-1',
      localEntityId: 'local-1',
      payloadHash: validItem.payloadHash,
      conflictType: 'version',
      description: 'original',
      status: 'open',
    });
    expect(store.getQueueItem(tenantId, 'queue-1')?.status).toBe('conflict');
    const resolved = await store.resolveConflict(
      scope,
      conflict.conflictId,
      { resolution: 'device-wins' },
      '2026-08-25T13:00:00.000Z',
    );
    expect(resolved).toEqual({
      ...conflict,
      description: 'original',
      status: 'resolved',
      resolution: 'device-wins',
      resolvedBy: 'agent-a',
      resolvedAt: '2026-08-25T13:00:00.000Z',
    });
    expect(store.getQueueItem(tenantId, 'queue-1')?.status).toBe('applied');

    const secondItem = {
      ...validItem,
      queueItemId: 'queue-2',
      idempotencyKey: 'idem-2',
      payloadHash: `sha256:${'b'.repeat(64)}`,
    };
    await store.submitSyncBatch(
      scope,
      { orgUnitId: 'org-a', deviceId: 'device-a', deviceBatchId: 'batch-b', items: [secondItem] },
      now,
    );
    const second = await store.openConflict(
      scope,
      'queue-2',
      { conflictType: 'version', description: 'original-two' },
      now,
    );
    const server = await store.resolveConflict(
      scope,
      second.conflictId,
      { resolution: 'server-wins', description: 'server accepted' },
      '2026-08-25T14:00:00.000Z',
    );
    expect(server.description).toBe('server accepted');
    expect(server.resolution).toBe('server-wins');
    expect(store.getQueueItem(tenantId, 'queue-2')?.status).toBe('rejected');
  });

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
