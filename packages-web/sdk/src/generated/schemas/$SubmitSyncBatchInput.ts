/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SubmitSyncBatchInput = {
    properties: {
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
        orgUnitId: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
