/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $OfflineSyncStynxContext = {
  properties: {
    appliedAt: {
      type: 'string',
    },
    attempts: {
      type: 'number',
    },
    concurrencySuspected: {
      type: 'boolean',
    },
    concurrentPairs: {
      type: 'array',
      contains: {
        type: 'OfflineSyncConcurrentPair',
      },
    },
    consumerAttributes: {
      type: 'OfflineSyncConsumerAttributes',
    },
    errorCode: {
      type: 'string',
    },
    errorMessage: {
      type: 'string',
    },
    reasonCode: {
      type: 'string',
    },
    receiptId: {
      type: 'string',
    },
    receivedPayloadHash: {
      type: 'string',
    },
    relatedQueueItemId: {
      type: 'string',
    },
    retryable: {
      type: 'boolean',
    },
    serverEntityId: {
      type: 'string',
    },
    signals: {
      type: 'array',
      contains: {
        properties: {
          code: {
            type: 'string',
            isRequired: true,
          },
        },
      },
    },
    storedPayloadHash: {
      type: 'string',
    },
    terminalReceived: {
      type: 'boolean',
    },
    version: {
      type: 'number',
      isRequired: true,
    },
  },
} as const;
