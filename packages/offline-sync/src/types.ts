export type OfflineSyncQueueStatus = 'received' | 'applied' | 'conflict' | 'rejected';

export type OfflineSyncConflictResolutionStrategy = 'device-wins' | 'server-wins' | 'manual-review';

export interface TrustedOfflineSyncScope {
  readonly tenantId: string;
  readonly actorId: string;
}

export interface OfflineSyncContextPort {
  current(): TrustedOfflineSyncScope;
}

export interface NumberingRange {
  readonly id: string;
  readonly tenantId: string;
  readonly orgUnitId: string;
  readonly entityType: string;
  readonly series: string;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly nextNumber: number;
  readonly status: 'active' | 'exhausted' | 'cancelled';
}

export interface NumberingReservation {
  readonly reservationId: string;
  readonly rangeId: string;
  readonly tenantId: string;
  readonly orgUnitId: string;
  readonly entityType: string;
  readonly series: string;
  readonly agentId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly startNumber: number;
  readonly endNumber: number;
  readonly nextNumber: number;
  readonly validUntil: string;
  readonly status: 'reserved' | 'consumed' | 'expired' | 'cancelled';
}

export interface ReserveNumberingInput {
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly shiftId: string;
  readonly entityType: string;
  readonly requestedSize: number;
  readonly rangeId?: string;
  readonly series?: string;
  readonly validUntil?: string;
}

export interface CancelNumberingReservationInput {
  readonly reason?: string;
}

export interface SyncBatchItemInput {
  readonly queueItemId: string;
  readonly entityType: string;
  readonly localEntityId: string;
  readonly idempotencyKey: string;
  readonly payloadHash: string;
  readonly payloadJson: Record<string, unknown>;
  readonly createdLocallyAt: string;
  readonly reservedNumber?: number;
}

export interface SubmitSyncBatchInput {
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly deviceBatchId: string;
  readonly items: readonly SyncBatchItemInput[];
}

export interface StoredSyncQueueItem extends SyncBatchItemInput {
  readonly tenantId: string;
  readonly agentId: string;
  readonly orgUnitId: string;
  readonly deviceId: string;
  readonly status: OfflineSyncQueueStatus;
  readonly receivedAt: string;
}

export interface SubmitSyncBatchResult {
  readonly batchId: string;
  readonly acceptedItems: number;
  readonly duplicateItems: number;
  readonly conflicts: readonly string[];
  readonly items: readonly StoredSyncQueueItem[];
}

export interface OpenSyncConflictInput {
  readonly conflictType: string;
  readonly description: string;
}

export interface ResolveSyncConflictInput {
  readonly resolution: OfflineSyncConflictResolutionStrategy;
  readonly description?: string;
}

export interface SyncConflict {
  readonly conflictId: string;
  readonly tenantId: string;
  readonly queueItemId: string;
  readonly localEntityId: string;
  readonly payloadHash: string;
  readonly conflictType: string;
  readonly description: string;
  readonly status: 'open' | 'resolved';
  readonly resolution?: OfflineSyncConflictResolutionStrategy;
  readonly resolvedBy?: string;
  readonly resolvedAt?: string;
}

export interface OfflineSyncStore {
  reserveNumbering(
    scope: TrustedOfflineSyncScope,
    input: ReserveNumberingInput,
    now: string,
    defaultValidUntil: string,
  ): Promise<NumberingReservation>;
  cancelNumberingReservation(
    scope: TrustedOfflineSyncScope,
    reservationId: string,
    input: CancelNumberingReservationInput,
    now: string,
  ): Promise<NumberingReservation>;
  submitSyncBatch(
    scope: TrustedOfflineSyncScope,
    input: SubmitSyncBatchInput,
    now: string,
  ): Promise<SubmitSyncBatchResult>;
  openConflict(
    scope: TrustedOfflineSyncScope,
    queueItemId: string,
    input: OpenSyncConflictInput,
    now: string,
  ): Promise<SyncConflict>;
  resolveConflict(
    scope: TrustedOfflineSyncScope,
    conflictId: string,
    input: ResolveSyncConflictInput,
    now: string,
  ): Promise<SyncConflict>;
}

export interface StynxOfflineSyncModuleOptions {
  readonly store?: OfflineSyncStore;
  readonly context?: OfflineSyncContextPort;
  readonly mountControllers?: boolean;
  readonly now?: () => string;
  readonly reservationTtlMs?: number;
}
