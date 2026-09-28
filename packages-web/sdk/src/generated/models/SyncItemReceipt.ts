/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
import type { OfflineSyncQueueStatus } from './OfflineSyncQueueStatus';
export type SyncItemReceipt = {
    context?: Record<string, JsonValue>;
    errorCode?: string;
    queueItemId: string;
    status: OfflineSyncQueueStatus;
};

