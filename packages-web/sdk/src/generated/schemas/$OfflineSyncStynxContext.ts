/* generated using openapi-typescript-codegen -- do not edit */
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
        storedPayloadHash: {
            type: 'string',
        },
        version: {
            type: 'number',
            isRequired: true,
        },
    },
} as const;
