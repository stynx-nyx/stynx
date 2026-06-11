/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateWorkItemDto = {
    properties: {
        category: {
            type: 'string',
        },
        code: {
            type: 'string',
            isRequired: true,
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
            isRequired: true,
        },
        recordId: {
            type: 'string',
            isRequired: true,
        },
        status: {
            type: 'Enum',
        },
        targetOn: {
            type: 'string',
            isRequired: true,
        },
        totalUnits: {
            type: 'number',
        },
    },
} as const;
