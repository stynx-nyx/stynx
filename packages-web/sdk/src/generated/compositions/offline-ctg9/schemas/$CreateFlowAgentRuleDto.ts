/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowAgentRuleDto = {
    properties: {
        nodeId: {
            type: 'string',
            isRequired: true,
        },
        params: {
            type: 'FlowJsonObject',
        },
        permissionKey: {
            type: 'string',
        },
        resolverKey: {
            type: 'string',
        },
        ruleType: {
            type: 'FlowAgentRuleType',
            isRequired: true,
        },
        sortOrder: {
            type: 'number',
        },
        userId: {
            type: 'string',
        },
    },
} as const;
