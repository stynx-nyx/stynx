/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowNodeDto = {
    properties: {
        allowedActions: {
            type: 'array',
            contains: {
                type: 'string',
            },
        },
        code: {
            type: 'string',
            isRequired: true,
        },
        decisionPolicy: {
            type: 'FlowDecisionPolicy',
        },
        entryRule: {
            type: 'string',
        },
        exitRule: {
            type: 'string',
        },
        graphId: {
            type: 'string',
            isRequired: true,
        },
        kind: {
            type: 'FlowNodeKind',
            isRequired: true,
        },
        meta: {
            type: 'FlowJsonObject',
        },
        name: {
            type: 'string',
        },
        quorumRatio: {
            type: 'string',
        },
        slaSeconds: {
            type: 'number',
        },
        sortOrder: {
            type: 'number',
        },
    },
} as const;
