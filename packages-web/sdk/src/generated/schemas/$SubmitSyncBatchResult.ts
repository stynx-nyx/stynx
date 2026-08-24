/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SubmitSyncBatchResult = {
    properties: {
        acceptedItems: {
            type: 'number',
            isRequired: true,
        },
        batchId: {
            type: 'string',
            isRequired: true,
        },
        conflicts: {
            type: 'UnknownJson',
            isRequired: true,
        },
        duplicateItems: {
            type: 'number',
            isRequired: true,
        },
        items: {
            type: 'UnknownJson',
            isRequired: true,
        },
    },
} as const;
