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
  | 'OFFLINE_SYNC_QUEUE_ITEM_NOT_FOUND'
  | 'OFFLINE_SYNC_QUEUE_ID_REUSED'
  | 'OFFLINE_SYNC_CONFLICT_NOT_FOUND'
  | 'OFFLINE_SYNC_CONFLICT_STATE';

export class OfflineSyncError extends HttpException {
  constructor(
    readonly code: OfflineSyncErrorCode,
    status: number,
    message: string,
  ) {
    super({ statusCode: status, errorCode: code, message, retryable: false }, status);
  }
}
