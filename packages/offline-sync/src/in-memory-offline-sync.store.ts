import { randomUUID } from 'node:crypto';
import { OfflineSyncError } from './errors';
import type {
  CancelNumberingReservationInput,
  NumberingRange,
  NumberingReservation,
  OfflineSyncStore,
  OpenSyncConflictInput,
  ResolveSyncConflictInput,
  StoredSyncQueueItem,
  SubmitSyncBatchInput,
  SubmitSyncBatchResult,
  SyncConflict,
  TrustedOfflineSyncScope,
  ReserveNumberingInput,
} from './types';

/** Deterministic process-local store for tests and sandbox wiring. */
export class InMemoryOfflineSyncStore implements OfflineSyncStore {
  private readonly ranges = new Map<string, NumberingRange>();
  private readonly reservations = new Map<string, NumberingReservation>();
  private readonly queueItems = new Map<string, StoredSyncQueueItem>();
  private readonly payloadIndex = new Map<string, string>();
  private readonly conflicts = new Map<string, SyncConflict>();

  seedNumberingRange(range: NumberingRange): void {
    this.ranges.set(this.key(range.tenantId, range.id), { ...range });
  }

  async reserveNumbering(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
    _now: string,
    defaultValidUntil: string,
  ): Promise<NumberingReservation> {
    const range = [...this.ranges.values()].find(
      (candidate) =>
        candidate.tenantId === scope.tenantId &&
        (input.rangeId
          ? candidate.id === input.rangeId
          : candidate.orgUnitId === input.orgUnitId &&
            candidate.entityType === input.entityType &&
            (!input.series || candidate.series === input.series)),
    );
    if (!range) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_NOT_FOUND',
        404,
        'No tenant-scoped numbering range matches this entity and organizational unit.',
      );
    }
    if (
      range.status !== 'active' ||
      range.orgUnitId !== input.orgUnitId ||
      range.entityType !== input.entityType
    ) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_UNAVAILABLE',
        409,
        'The selected numbering range is not active for this entity and organizational unit.',
      );
    }
    const endNumber = range.nextNumber + input.requestedSize - 1;
    if (endNumber > range.endNumber) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RANGE_UNAVAILABLE',
        409,
        'The selected numbering range has insufficient capacity.',
      );
    }
    this.ranges.set(this.key(scope.tenantId, range.id), {
      ...range,
      nextNumber: endNumber + 1,
      status: endNumber === range.endNumber ? 'exhausted' : 'active',
    });
    const reservation: NumberingReservation = {
      reservationId: randomUUID(),
      rangeId: range.id,
      tenantId: scope.tenantId,
      orgUnitId: input.orgUnitId,
      entityType: input.entityType,
      series: range.series,
      agentId: scope.actorId,
      deviceId: input.deviceId,
      shiftId: input.shiftId,
      startNumber: range.nextNumber,
      endNumber,
      nextNumber: range.nextNumber,
      validUntil: input.validUntil ?? defaultValidUntil,
      status: 'reserved',
    };
    this.reservations.set(this.key(scope.tenantId, reservation.reservationId), reservation);
    return reservation;
  }

  async cancelNumberingReservation(
    scope: TrustedOfflineSyncScope,
    reservationId: string,
    _input: CancelNumberingReservationInput,
    _now: string,
  ): Promise<NumberingReservation> {
    const key = this.key(scope.tenantId, reservationId);
    const reservation = this.reservations.get(key);
    if (!reservation) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_NOT_FOUND',
        404,
        `Numbering reservation ${reservationId} was not found.`,
      );
    }
    if (reservation.status !== 'reserved') {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_RESERVATION_STATE',
        409,
        `Numbering reservation ${reservationId} is ${reservation.status}; expected reserved.`,
      );
    }
    const cancelled: NumberingReservation = { ...reservation, status: 'cancelled' };
    this.reservations.set(key, cancelled);
    return cancelled;
  }

  async submitSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: SubmitSyncBatchInput,
    now: string,
  ): Promise<SubmitSyncBatchResult> {
    const stored: StoredSyncQueueItem[] = [];
    let duplicateItems = 0;
    for (const item of input.items) {
      const payloadKey = this.key(scope.tenantId, item.payloadHash);
      const existingId = this.payloadIndex.get(payloadKey);
      if (existingId) {
        const existing = this.queueItems.get(this.key(scope.tenantId, existingId));
        if (existing) {
          duplicateItems += 1;
          stored.push(existing);
          continue;
        }
      }
      const itemKey = this.key(scope.tenantId, item.queueItemId);
      const reused = this.queueItems.get(itemKey);
      if (reused && reused.payloadHash !== item.payloadHash) {
        throw new OfflineSyncError(
          'OFFLINE_SYNC_QUEUE_ID_REUSED',
          409,
          `Queue item ${item.queueItemId} was already used with another payload hash.`,
        );
      }
      const queueItem: StoredSyncQueueItem = {
        ...item,
        tenantId: scope.tenantId,
        agentId: scope.actorId,
        orgUnitId: input.orgUnitId,
        deviceId: input.deviceId,
        status: 'received',
        receivedAt: now,
      };
      this.queueItems.set(itemKey, queueItem);
      this.payloadIndex.set(payloadKey, item.queueItemId);
      stored.push(queueItem);
    }
    return {
      batchId: input.deviceBatchId,
      acceptedItems: input.items.length,
      duplicateItems,
      conflicts: stored
        .filter((item) => item.status === 'conflict')
        .map((item) => item.queueItemId),
      items: stored,
    };
  }

  async openConflict(
    scope: TrustedOfflineSyncScope,
    queueItemId: string,
    input: OpenSyncConflictInput,
    _now: string,
  ): Promise<SyncConflict> {
    const queueKey = this.key(scope.tenantId, queueItemId);
    const item = this.queueItems.get(queueKey);
    if (!item) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND',
        404,
        `Sync queue item ${queueItemId} was not found.`,
      );
    }
    this.queueItems.set(queueKey, { ...item, status: 'conflict' });
    const conflict: SyncConflict = {
      conflictId: randomUUID(),
      tenantId: scope.tenantId,
      queueItemId,
      localEntityId: item.localEntityId,
      payloadHash: item.payloadHash,
      conflictType: input.conflictType,
      description: input.description,
      status: 'open',
    };
    this.conflicts.set(this.key(scope.tenantId, conflict.conflictId), conflict);
    return conflict;
  }

  async resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict> {
    const conflictKey = this.key(scope.tenantId, conflictId);
    const conflict = this.conflicts.get(conflictKey);
    if (!conflict) {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_NOT_FOUND',
        404,
        `Sync conflict ${conflictId} was not found.`,
      );
    }
    if (conflict.status !== 'open') {
      throw new OfflineSyncError(
        'OFFLINE_SYNC_CONFLICT_STATE',
        409,
        `Sync conflict ${conflictId} is ${conflict.status}; expected open.`,
      );
    }
    const resolved: SyncConflict = {
      ...conflict,
      description: input.description ?? conflict.description,
      status: 'resolved',
      resolution: input.resolution,
      resolvedBy: scope.actorId,
      resolvedAt: now,
    };
    this.conflicts.set(conflictKey, resolved);
    const queueKey = this.key(scope.tenantId, conflict.queueItemId);
    const queueItem = this.queueItems.get(queueKey);
    if (queueItem) {
      this.queueItems.set(queueKey, {
        ...queueItem,
        status: input.resolution === 'server-wins' ? 'rejected' : 'applied',
      });
    }
    return resolved;
  }

  getQueueItem(tenantId: string, queueItemId: string): StoredSyncQueueItem | undefined {
    return this.queueItems.get(this.key(tenantId, queueItemId));
  }

  private key(tenantId: string, id: string): string {
    return `${tenantId}:${id}`;
  }
}
