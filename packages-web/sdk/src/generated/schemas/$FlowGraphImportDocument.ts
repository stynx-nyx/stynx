/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $FlowGraphImportDocument = {
    properties: {
        agentRules: {
            type: 'array',
            contains: {
                type: 'all-of',
                contains: [{
                    type: 'FlowJsonObject',
                }, {
                    properties: {
                        nodeCode: {
                            type: 'string',
                            isRequired: true,
                        },
                    },
                }],
            },
        },
        edges: {
            type: 'array',
            contains: {
                type: 'FlowGraphImportEdge',
            },
        },
        graph: {
            type: 'FlowJsonObject',
            isRequired: true,
        },
        nodeFormRules: {
            type: 'array',
            contains: {
                type: 'all-of',
                contains: [{
                    type: 'FlowJsonObject',
                }, {
                    properties: {
                        nodeCode: {
                            type: 'string',
                            isRequired: true,
                        },
                    },
                }],
            },
        },
        nodes: {
            type: 'array',
            contains: {
                type: 'FlowGraphImportNode',
            },
            isRequired: true,
        },
        transitionEffects: {
            type: 'array',
            contains: {
                type: 'FlowJsonObject',
            },
        },
    },
} as const;
