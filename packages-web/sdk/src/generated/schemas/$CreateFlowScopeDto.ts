/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowScopeDto = {
    properties: {
        adapterConfig: {
            type: 'FlowJsonObject',
        },
        adapterKey: {
            type: 'string',
            isRequired: true,
        },
        code: {
            type: 'string',
            isRequired: true,
        },
        label: {
            type: 'string',
            isRequired: true,
        },
        meta: {
            type: 'FlowJsonObject',
        },
    },
} as const;
