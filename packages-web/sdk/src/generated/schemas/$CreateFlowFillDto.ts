/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowFillDto = {
    properties: {
        formId: {
            type: 'string',
            isRequired: true,
        },
        nodeRunId: {
            type: 'string',
        },
        runId: {
            type: 'string',
        },
        scopeId: {
            type: 'string',
            isRequired: true,
        },
        status: {
            type: 'FlowFillStatus',
        },
        targetId: {
            type: 'string',
            isRequired: true,
        },
        targetType: {
            type: 'string',
            isRequired: true,
        },
        taskId: {
            type: 'string',
        },
    },
} as const;
