/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $CreateFlowNodeFormRuleDto = {
    properties: {
        applicability: {
            type: 'FlowJsonObject',
        },
        formId: {
            type: 'string',
            isRequired: true,
        },
        gatingMode: {
            type: 'FlowNodeFormGatingMode',
        },
        meta: {
            type: 'FlowJsonObject',
        },
        nodeId: {
            type: 'string',
            isRequired: true,
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
