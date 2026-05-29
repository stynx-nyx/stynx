/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $UpdateWorkItemDto = {
    properties: {
        category: {
            type: 'string',
        },
        code: {
            type: 'string',
        },
        createdByUserId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        openedOn: {
            type: 'string',
        },
        recordId: {
            type: 'string',
        },
        status: {
            type: 'Enum',
        },
        targetOn: {
            type: 'string',
        },
        totalUnits: {
            type: 'number',
        },
    },
} as const;
