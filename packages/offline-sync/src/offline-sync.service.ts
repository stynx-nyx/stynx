import { Inject, Injectable } from '@nestjs/common';
import { OfflineSyncError } from './errors';
import {
  STYNX_OFFLINE_SYNC_CONTEXT,
  STYNX_OFFLINE_SYNC_OPTIONS,
  STYNX_OFFLINE_SYNC_STORE,
} from './tokens';
import type {
  CancelNumberingReservationInput,
  NumberingReservation,
  OfflineSyncContextPort,
  OfflineSyncStore,
  OpenSyncConflictInput,
  ReserveNumberingInput,
  ResolveSyncConflictInput,
  StynxOfflineSyncModuleOptions,
  SubmitSyncBatchInput,
  SubmitSyncBatchResult,
  SyncConflict,
} from './types';

const sha256Pattern = /^sha256:[0-9a-f]{64}$/u;

@Injectable()
export class OfflineSyncService {
  constructor(
    @Inject(STYNX_OFFLINE_SYNC_STORE) private readonly store: OfflineSyncStore,
    @Inject(STYNX_OFFLINE_SYNC_CONTEXT) private readonly context: OfflineSyncContextPort,
    @Inject(STYNX_OFFLINE_SYNC_OPTIONS)
    private readonly options: StynxOfflineSyncModuleOptions,
  ) {}

  async reserveNumbering(input: ReserveNumberingInput): Promise<NumberingReservation> {
    this.assertText(input.orgUnitId, 'orgUnitId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.shiftId, 'shiftId');
    this.assertEntityType(input.entityType);
    if (
      !Number.isSafeInteger(input.requestedSize) ||
      input.requestedSize < 1 ||
      input.requestedSize > 100
    ) {
      this.invalid('requestedSize must be an integer between 1 and 100.');
    }
    const now = this.now();
    const validUntil = new Date(
      Date.parse(now) + (this.options.reservationTtlMs ?? 86_400_000),
    ).toISOString();
    if (input.validUntil && Date.parse(input.validUntil) <= Date.parse(now)) {
      this.invalid('validUntil must be later than the current time.');
    }
    return this.store.reserveNumbering(this.context.current(), input, now, validUntil);
  }

  async cancelNumberingReservation(
    reservationId: string,
    input: CancelNumberingReservationInput = {},
  ): Promise<NumberingReservation> {
    this.assertText(reservationId, 'reservationId');
    if (input.reason !== undefined && input.reason.length > 500) {
      this.invalid('reason must not exceed 500 characters.');
    }
    return this.store.cancelNumberingReservation(
      this.context.current(),
      reservationId,
      input,
      this.now(),
    );
  }

  async submitSyncBatch(input: SubmitSyncBatchInput): Promise<SubmitSyncBatchResult> {
    this.assertText(input.orgUnitId, 'orgUnitId');
    this.assertText(input.deviceId, 'deviceId');
    this.assertText(input.deviceBatchId, 'deviceBatchId');
    if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
      this.invalid('items must contain between 1 and 100 queue items.');
    }
    const queueIds = new Set<string>();
    for (const item of input.items) {
      this.assertText(item.queueItemId, 'queueItemId');
      this.assertEntityType(item.entityType);
      this.assertText(item.localEntityId, 'localEntityId');
      this.assertText(item.idempotencyKey, 'idempotencyKey');
      if (!sha256Pattern.test(item.payloadHash)) {
        this.invalid('payloadHash must be a canonical sha256-prefixed hexadecimal digest.');
      }
      if (!Number.isFinite(Date.parse(item.createdLocallyAt))) {
        this.invalid('createdLocallyAt must be an ISO-8601 timestamp.');
      }
      if (
        !item.payloadJson ||
        typeof item.payloadJson !== 'object' ||
        Array.isArray(item.payloadJson)
      ) {
        this.invalid('payloadJson must be an object.');
      }
      if (queueIds.has(item.queueItemId)) {
        this.invalid(`queueItemId ${item.queueItemId} appears more than once in the batch.`);
      }
      queueIds.add(item.queueItemId);
    }
    return this.store.submitSyncBatch(this.context.current(), input, this.now());
  }

  async openConflict(queueItemId: string, input: OpenSyncConflictInput): Promise<SyncConflict> {
    this.assertText(queueItemId, 'queueItemId');
    this.assertText(input.conflictType, 'conflictType');
    this.assertText(input.description, 'description');
    return this.store.openConflict(this.context.current(), queueItemId, input, this.now());
  }

  async resolveConflict(
    conflictId: string,
    input: ResolveSyncConflictInput,
  ): Promise<SyncConflict> {
    this.assertText(conflictId, 'conflictId');
    if (!['device-wins', 'server-wins', 'manual-review'].includes(input.resolution)) {
      this.invalid('resolution must be device-wins, server-wins or manual-review.');
    }
    return this.store.resolveConflict(this.context.current(), conflictId, input, this.now());
  }

  private now(): string {
    return (this.options.now ?? (() => new Date().toISOString()))();
  }

  private assertEntityType(value: string): void {
    this.assertText(value, 'entityType');
    if (value.length > 100) this.invalid('entityType must not exceed 100 characters.');
  }

  private assertText(value: string, field: string): void {
    if (typeof value !== 'string' || value.trim().length === 0) {
      this.invalid(`${field} is required.`);
    }
  }

  private invalid(message: string): never {
    throw new OfflineSyncError('OFFLINE_SYNC_INVALID_INPUT', 400, message);
  }
}
