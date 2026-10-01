import { HttpException } from '@nestjs/common';

export type OfflineSyncErrorCode =
  | 'OFFLINE_SYNC_UNAUTHENTICATED'
  | 'OFFLINE_SYNC_FORBIDDEN'
  | 'OFFLINE_SYNC_CONTEXT_OVERRIDE'
  | 'OFFLINE_SYNC_INVALID_INPUT'
  | 'OFFLINE_SYNC_RANGE_NOT_FOUND'
  | 'OFFLINE_SYNC_RANGE_UNAVAILABLE'
  | 'OFFLINE_SYNC_RESERVATION_NOT_FOUND'
  | 'OFFLINE_SYNC_RESERVATION_STATE'
  | 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE'
  | 'OFFLINE_SYNC_NUMBERING_AMBIGUOUS'
  | 'OFFLINE_SYNC_NUMBERING_EXPIRED'
  | 'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED'
  | 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND'
  | 'OFFLINE_SYNC_QUEUE_ID_REUSED'
  | 'OFFLINE_SYNC_CONFLICT_NOT_FOUND'
  | 'OFFLINE_SYNC_CONFLICT_STATE'
  | 'OFFLINE_SYNC_CONFLICT_RESOLUTION'
  | 'OFFLINE_SYNC_BATCH_CONFLICT'
  | 'OFFLINE_SYNC_BATCH_SEQUENCE'
  | 'OFFLINE_SYNC_ITEM_INTEGRITY'
  | 'OFFLINE_SYNC:BATCH:in-progress';
export class OfflineSyncConfigurationError extends Error {
  readonly code = 'OFFLINE_SYNC_CONFIGURATION_ERROR';
  constructor(option: string) { super(`Invalid offline-sync configuration: ${option}`); }
}

export class OfflineSyncUpgradeRequiredError extends HttpException {
  readonly code = 'OFFLINE_SYNC_UPGRADE_REQUIRED';
  constructor(migration = '0002') {
    super({ statusCode: 503, errorCode: 'OFFLINE_SYNC_UPGRADE_REQUIRED', message: `Offline-sync migration ${migration} is required.`, retryable: true }, 503);
  }
}

export class OfflineSyncError extends HttpException {
  constructor(
    readonly code: OfflineSyncErrorCode,
    status: number,
    message: string,
    retryable = false,
    requestId?: string,
  ) {
    super({ statusCode: status, errorCode: code, message, retryable,
      ...(requestId ? { requestId } : {}) }, status);
  }
}

export type OfflineSyncNumberingCode =
  | 'OFFLINE_SYNC_NUMBERING_NO_COVERAGE'
  | 'OFFLINE_SYNC_NUMBERING_AMBIGUOUS'
  | 'OFFLINE_SYNC_NUMBERING_EXPIRED'
  | 'OFFLINE_SYNC_NUMBERING_ALREADY_APPLIED';

export class OfflineSyncNumberingOutcome extends OfflineSyncError {
  readonly receiptStatus: 'rejected' | 'conflict';
  readonly context: {number:number;reservationId:string|null};
  constructor(code: OfflineSyncNumberingCode, number: number, reservationId: string | null) {
    super(code,409,code);
    this.receiptStatus = code === 'OFFLINE_SYNC_NUMBERING_EXPIRED' ? 'conflict' : 'rejected';
    this.context = {number,reservationId};
  }
}

/** Why a range refused a reservation; the public code stays `OFFLINE_SYNC_RANGE_UNAVAILABLE`. */
export type OfflineSyncRangeUnavailableReason = 'inactive' | 'exhausted' | 'insufficient_capacity';

export class OfflineSyncRangeUnavailableError extends OfflineSyncError {
  constructor(readonly reason: OfflineSyncRangeUnavailableReason, message: string) {
    super('OFFLINE_SYNC_RANGE_UNAVAILABLE', 409, message);
  }
}

/** Same reservation idempotency key reused with a different request (UPS-OFS-05). */
export class OfflineSyncReservationReplayError extends HttpException {
  readonly code = 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT';
  constructor() {
    super({ statusCode: 409, errorCode: 'OFFLINE_SYNC_RESERVATION_IDEMPOTENCY_CONFLICT',
      message: 'Reservation idempotency key was already used with a different request.', retryable: false }, 409);
  }
}
