/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
import type { OfflineSyncQueueStatus } from './OfflineSyncQueueStatus';
import type { SyncBatchReceipt } from './SyncBatchReceipt';
export type CTG9SubmitSyncBatchResult = {
  acceptedItems: number;
  batchId: string;
  conflicts: Array<string>;
  duplicateItems: number;
  items: Array<{
    agentId: string;
    createdLocallyAt: string;
    deviceId: string;
    entityType: string;
    idempotencyKey?: string;
    localEntityId: string;
    orgUnitId: string;
    payloadHash: string;
    payloadJson: Record<string, JsonValue>;
    queueItemId: string;
    receivedAt: string;
    reservedNumber?: number;
    status: OfflineSyncQueueStatus;
    tenantId: string;
  }>;
  receipt: SyncBatchReceipt;
};
