/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OfflineSyncConcurrentPair } from './OfflineSyncConcurrentPair';
import type { OfflineSyncConsumerAttributes } from './OfflineSyncConsumerAttributes';
export type OfflineSyncStynxContext = {
  appliedAt?: string;
  attempts?: number;
  concurrencySuspected?: boolean;
  concurrentPairs?: Array<OfflineSyncConcurrentPair>;
  consumerAttributes?: OfflineSyncConsumerAttributes;
  errorCode?: string;
  errorMessage?: string;
  reasonCode?: string;
  receiptId?: string;
  receivedPayloadHash?: string;
  relatedQueueItemId?: string;
  retryable?: boolean;
  serverEntityId?: string;
  signals?: Array<{
    code: string;
  }>;
  storedPayloadHash?: string;
  terminalReceived?: boolean;
  version: number;
};
