/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $CreateWorkItemLockDto = {
    properties: {
        amountUnits: {
            type: 'number',
            isRequired: true,
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
            isRequired: true,
        },
        reason: {
            type: 'Enum',
            isRequired: true,
        },
        workItemId: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
