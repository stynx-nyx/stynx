/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $EnsureFlowRunDto = {
    properties: {
        adapterKey: {
            type: 'string',
        },
        graphCode: {
            type: 'string',
            isRequired: true,
        },
        payload: {
            type: 'FlowJsonObject',
        },
        scopeCode: {
            type: 'string',
        },
        scopeId: {
            type: 'string',
        },
        signalKey: {
            type: 'string',
        },
        targetId: {
            type: 'string',
            isRequired: true,
        },
        targetType: {
            type: 'string',
        },
        version: {
            type: 'string',
        },
    },
} as const;
