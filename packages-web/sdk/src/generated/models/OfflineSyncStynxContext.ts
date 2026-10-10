/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OfflineSyncConsumerAttributes } from './OfflineSyncConsumerAttributes';
export type OfflineSyncStynxContext = {
    appliedAt?: string;
    attempts?: number;
    consumerAttributes?: OfflineSyncConsumerAttributes;
    errorCode?: string;
    errorMessage?: string;
    reasonCode?: string;
    receiptId?: string;
    receivedPayloadHash?: string;
    relatedQueueItemId?: string;
    retryable?: boolean;
    serverEntityId?: string;
    storedPayloadHash?: string;
    version: number;
};

