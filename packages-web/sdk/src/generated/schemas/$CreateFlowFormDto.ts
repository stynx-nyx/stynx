/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowFormDto = {
    properties: {
        code: {
            type: 'string',
            isRequired: true,
        },
        description: {
            type: 'string',
        },
        isActive: {
            type: 'boolean',
        },
        meta: {
            type: 'FlowJsonObject',
        },
        scopeId: {
            type: 'string',
            isRequired: true,
        },
        title: {
            type: 'string',
            isRequired: true,
        },
        version: {
            type: 'string',
        },
    },
} as const;
