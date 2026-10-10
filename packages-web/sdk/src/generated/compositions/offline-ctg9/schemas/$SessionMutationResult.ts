/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionMutationResult = {
    properties: {
        action: {
            type: 'SessionAction',
            isRequired: true,
        },
        effectiveBy: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        errorCode: {
            type: 'string',
        },
        guarantee: {
            type: 'SessionGuarantee',
            isRequired: true,
        },
        operationId: {
            type: 'string',
            isRequired: true,
        },
        results: {
            type: 'array',
            contains: {
                type: 'SessionItemResult',
            },
            isRequired: true,
        },
        scope: {
            type: 'SessionScope',
            isRequired: true,
        },
        status: {
            type: 'MutationStatus',
            isRequired: true,
        },
    },
} as const;
