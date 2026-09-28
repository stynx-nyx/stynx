/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SyncItemReceipt = {
    properties: {
        context: {
            type: 'dictionary',
            contains: {
                type: 'JsonValue',
            },
        },
        errorCode: {
            type: 'string',
        },
        queueItemId: {
            type: 'string',
            isRequired: true,
        },
        status: {
            type: 'OfflineSyncQueueStatus',
            isRequired: true,
        },
    },
} as const;
