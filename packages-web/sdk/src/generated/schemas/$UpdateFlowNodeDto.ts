/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $UpdateFlowNodeDto = {
    properties: {
        allowedActions: {
            type: 'array',
            contains: {
                type: 'string',
            },
        },
        code: {
            type: 'string',
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
        kind: {
            type: 'FlowNodeKind',
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
