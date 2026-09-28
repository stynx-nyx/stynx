/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SyncBatchReceipt = {
    properties: {
        batchSequence: {
            type: 'any-of',
            contains: [{
                type: 'number',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        deviceBatchId: {
            type: 'string',
            isRequired: true,
        },
        deviceId: {
            type: 'string',
            isRequired: true,
        },
        items: {
            type: 'UnknownJson',
            isRequired: true,
        },
        responseBodyBytes: {
            type: 'any-of',
            contains: [{
                type: 'binary',
                format: 'binary',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        responseHeaders: {
            type: 'dictionary',
            contains: {
                type: 'string',
            },
            isRequired: true,
        },
        responseStatus: {
            type: 'any-of',
            contains: [{
                type: 'number',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        status: {
            type: 'Enum',
            isRequired: true,
        },
    },
} as const;
