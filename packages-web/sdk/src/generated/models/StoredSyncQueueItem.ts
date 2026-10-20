/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
import type { OfflineSyncQueueStatus } from './OfflineSyncQueueStatus';
export type StoredSyncQueueItem = {
  agentId: string;
  createdLocallyAt: string;
  deviceId: string;
  entityType: string;
  idempotencyKey: string;
  localEntityId: string;
  orgUnitId: string;
  payloadHash: string;
  payloadJson: Record<string, JsonValue>;
  queueItemId: string;
  receivedAt: string;
  reservedNumber?: number;
  status: OfflineSyncQueueStatus;
  tenantId: string;
};
