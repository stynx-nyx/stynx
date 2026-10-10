/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $FlowGraphExportDocument = {
    properties: {
        agentRules: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
        edges: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
        graph: {
            type: 'FlowJsonObject',
            isRequired: true,
        },
        nodeFormRules: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
        nodes: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
        policyRules: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
        policySets: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
        transitionEffects: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
            isRequired: true,
        },
    },
} as const;
