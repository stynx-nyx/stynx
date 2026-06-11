/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateRecordDto = {
    properties: {
        email: {
            type: 'string',
            isRequired: true,
        },
        externalRef: {
            type: 'string',
        },
        ownerUserId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        status: {
            type: 'Enum',
        },
        title: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
