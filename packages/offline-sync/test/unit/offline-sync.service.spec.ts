import { describe, expect, it } from 'vitest';
import { InMemoryOfflineSyncStore } from '../../src/in-memory-offline-sync.store';
import { OfflineSyncService } from '../../src/offline-sync.service';
import type {
  OfflineSyncContextPort,
  SyncBatchItemInput,
  TrustedOfflineSyncScope,
} from '../../src/types';

const tenantA = '00000000-0000-4000-8000-000000000001';
const tenantB = '00000000-0000-4000-8000-000000000002';
const now = '2026-08-24T12:00:00.000Z';

class MutableContext implements OfflineSyncContextPort {
  scope: TrustedOfflineSyncScope = { tenantId: tenantA, actorId: 'agent-a' };
  current(): TrustedOfflineSyncScope {
    return this.scope;
  }
}

function createHarness() {
  const store = new InMemoryOfflineSyncStore();
  const context = new MutableContext();
  const service = new OfflineSyncService(store, context, { now: () => now });
  store.seedNumberingRange({
    id: '10000000-0000-4000-8000-000000000001',
    tenantId: tenantA,
    orgUnitId: 'org-a',
    entityType: 'crash-record',
    series: 'CRASH',
    startNumber: 1000,
    endNumber: 1002,
    nextNumber: 1000,
    status: 'active',
  });
  store.seedNumberingRange({
    id: '10000000-0000-4000-8000-000000000002',
    tenantId: tenantB,
    orgUnitId: 'org-b',
    entityType: 'crash-record',
    series: 'CRASH',
    startNumber: 1000,
    endNumber: 1002,
    nextNumber: 1000,
    status: 'active',
  });
  return { store, context, service };
}

function item(overrides: Partial<SyncBatchItemInput> = {}): SyncBatchItemInput {
  return {
    queueItemId: 'sync-item-1',
    entityType: 'crash-record',
    localEntityId: 'crash-local-1',
    idempotencyKey: 'idem-1',
    payloadHash: `sha256:${'a'.repeat(64)}`,
    payloadJson: { severity: 'minor' },
    createdLocallyAt: now,
    reservedNumber: 1000,
    ...overrides,
  };
}

describe('OfflineSyncService', () => {
  it('returns the complete reservation projection and explicit validity override', async () => {
    const { service } = createHarness();
    const reservation = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'crash-record',
      requestedSize: 2,
      rangeId: '10000000-0000-4000-8000-000000000001',
      series: 'CRASH',
      validUntil: '2026-08-25T12:00:00.001Z',
    });
    expect(reservation).toEqual({
      reservationId: reservation.reservationId,
      rangeId: '10000000-0000-4000-8000-000000000001',
      tenantId: tenantA,
      orgUnitId: 'org-a',
      entityType: 'crash-record',
      series: 'CRASH',
      agentId: 'agent-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      startNumber: 1000,
      endNumber: 1001,
      nextNumber: 1000,
      validUntil: '2026-08-25T12:00:00.001Z',
      status: 'reserved',
    });
  });

  it('returns exact non-retryable queue reuse and reservation-state failures', async () => {
    const { service } = createHarness();
    const reservation = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'crash-record',
      requestedSize: 1,
    });
    await service.cancelNumberingReservation(reservation.reservationId);
    const reservationError = await service
      .cancelNumberingReservation(reservation.reservationId)
      .catch((error: unknown) => error);
    expect(reservationError.getStatus()).toBe(409);
    expect(reservationError.getResponse()).toEqual({
      statusCode: 409,
      errorCode: 'OFFLINE_SYNC_RESERVATION_STATE',
      message: `Numbering reservation ${reservation.reservationId} is cancelled; expected reserved.`,
      retryable: false,
    });

    const batch = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [item()],
    };
    await service.submitSyncBatch(batch);
    const reuseError = await service
      .submitSyncBatch({
        ...batch,
        deviceBatchId: 'batch-b',
        items: [item({ payloadHash: `sha256:${'b'.repeat(64)}` })],
      })
      .catch((error: unknown) => error);
    expect(reuseError.getStatus()).toBe(409);
    expect(reuseError.getResponse()).toEqual({
      statusCode: 409,
      errorCode: 'OFFLINE_SYNC_QUEUE_ID_REUSED',
      message: 'Queue item sync-item-1 was already used with another payload hash.',
      retryable: false,
    });
  });

  it('reserves generic entity numbering without AIT vocabulary', async () => {
    const { service } = createHarness();
    await expect(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'crash-record',
        requestedSize: 2,
        series: 'CRASH',
      }),
    ).resolves.toMatchObject({
      tenantId: tenantA,
      agentId: 'agent-a',
      entityType: 'crash-record',
      startNumber: 1000,
      endNumber: 1001,
      nextNumber: 1000,
      status: 'reserved',
    });
  });

  it('locks capacity through range advancement and validates cancellation state', async () => {
    const { service } = createHarness();
    const first = await service.reserveNumbering({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      shiftId: 'shift-a',
      entityType: 'crash-record',
      requestedSize: 3,
    });
    await expect(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'crash-record',
        requestedSize: 1,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_RANGE_UNAVAILABLE' });
    await expect(service.cancelNumberingReservation(first.reservationId)).resolves.toMatchObject({
      status: 'cancelled',
    });
    await expect(service.cancelNumberingReservation(first.reservationId)).rejects.toMatchObject({
      code: 'OFFLINE_SYNC_RESERVATION_STATE',
    });
  });

  it('accepts payload-hash replays idempotently within one tenant', async () => {
    const { service } = createHarness();
    const input = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [item()],
    };
    await expect(service.submitSyncBatch(input)).resolves.toMatchObject({
      acceptedItems: 1,
      duplicateItems: 0,
    });
    await expect(
      service.submitSyncBatch({
        ...input,
        deviceBatchId: 'batch-retry',
        items: [item({ queueItemId: 'sync-item-retry', idempotencyKey: 'idem-retry' })],
      }),
    ).resolves.toMatchObject({ acceptedItems: 1, duplicateItems: 1 });
  });

  it('scopes the same payload hash independently per tenant', async () => {
    const { service, context } = createHarness();
    await service.submitSyncBatch({
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [item()],
    });
    context.scope = { tenantId: tenantB, actorId: 'agent-b' };
    await expect(
      service.submitSyncBatch({
        orgUnitId: 'org-b',
        deviceId: 'device-b',
        deviceBatchId: 'batch-b',
        items: [item()],
      }),
    ).resolves.toMatchObject({ duplicateItems: 0 });
  });

  it('rejects queue-id reuse with a different payload and malformed hashes', async () => {
    const { service } = createHarness();
    const batch = {
      orgUnitId: 'org-a',
      deviceId: 'device-a',
      deviceBatchId: 'batch-a',
      items: [item()],
    };
    await service.submitSyncBatch(batch);
    await expect(
      service.submitSyncBatch({
        ...batch,
        deviceBatchId: 'batch-b',
        items: [item({ payloadHash: `sha256:${'b'.repeat(64)}` })],
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_QUEUE_ID_REUSED' });
    await expect(
      service.submitSyncBatch({
        ...batch,
        items: [item({ queueItemId: 'bad', payloadHash: 'sha256:not-a-digest' })],
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });

  it.each(['device-wins', 'server-wins', 'manual-review'] as const)(
    'preserves the %s conflict resolution mode',
    async (resolution) => {
      const { service, store } = createHarness();
      const queueItemId = `sync-${resolution}`;
      await service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: `batch-${resolution}`,
        items: [
          item({
            queueItemId,
            idempotencyKey: `idem-${resolution}`,
            payloadHash: `sha256:${(resolution === 'device-wins'
              ? 'c'
              : resolution === 'server-wins'
                ? 'd'
                : 'e'
            ).repeat(64)}`,
          }),
        ],
      });
      const conflict = await service.openConflict(queueItemId, {
        conflictType: 'version-mismatch',
        description: 'Concurrent server update',
      });
      await expect(
        service.resolveConflict(conflict.conflictId, { resolution }),
      ).resolves.toMatchObject({ status: 'resolved', resolution });
      expect(store.getQueueItem(tenantA, queueItemId)?.status).toBe(
        resolution === 'server-wins' ? 'rejected' : 'applied',
      );
    },
  );

  it('validates reservation bounds and batch cardinality', async () => {
    const { service } = createHarness();
    await expect(
      service.reserveNumbering({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        shiftId: 'shift-a',
        entityType: 'crash-record',
        requestedSize: 0,
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
    await expect(
      service.submitSyncBatch({
        orgUnitId: 'org-a',
        deviceId: 'device-a',
        deviceBatchId: 'empty',
        items: [],
      }),
    ).rejects.toMatchObject({ code: 'OFFLINE_SYNC_INVALID_INPUT' });
  });
});
