/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $UpdateFlowNodeFormRuleDto = {
    properties: {
        applicability: {
            type: 'FlowJsonObject',
        },
        gatingMode: {
            type: 'FlowNodeFormGatingMode',
        },
        meta: {
            type: 'FlowJsonObject',
        },
        required: {
            type: 'boolean',
        },
        threshold: {
            type: 'string',
        },
        weight: {
            type: 'string',
        },
    },
} as const;
