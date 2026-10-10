/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $NumberingConsumptionEntry = {
    properties: {
        finalizedAt: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        number: {
            type: 'number',
            isRequired: true,
        },
        serverEntityId: {
            type: 'any-of',
            contains: [{
                type: 'string',
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
