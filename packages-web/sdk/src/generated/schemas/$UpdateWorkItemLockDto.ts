/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $UpdateWorkItemLockDto = {
    properties: {
        amountUnits: {
            type: 'number',
        },
        externalRef: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        lockedAt: {
            type: 'string',
        },
        reason: {
            type: 'Enum',
        },
    },
} as const;
