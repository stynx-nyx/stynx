/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $CreateFlowEdgeDto = {
    properties: {
        action: {
            type: 'string',
        },
        fromNodeId: {
            type: 'string',
            isRequired: true,
        },
        graphId: {
            type: 'string',
            isRequired: true,
        },
        meta: {
            type: 'FlowJsonObject',
        },
        rule: {
            type: 'string',
        },
        sortOrder: {
            type: 'number',
        },
        spawn: {
            type: 'boolean',
        },
        toNodeId: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
