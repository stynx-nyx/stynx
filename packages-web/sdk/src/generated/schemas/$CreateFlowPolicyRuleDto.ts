/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowPolicyRuleDto = {
    properties: {
        action: {
            type: 'string',
        },
        capability: {
            type: 'string',
        },
        conditions: {
            type: 'FlowJsonObject',
        },
        effect: {
            type: 'FlowPolicyEffect',
            isRequired: true,
        },
        meta: {
            type: 'FlowJsonObject',
        },
        nodeCode: {
            type: 'string',
        },
        policySetId: {
            type: 'string',
            isRequired: true,
        },
        priority: {
            type: 'number',
        },
        reasonCode: {
            type: 'string',
        },
        statusCode: {
            type: 'string',
        },
    },
} as const;
