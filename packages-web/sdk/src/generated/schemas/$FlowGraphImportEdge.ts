/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $FlowGraphImportEdge = {
    properties: {
        action: {
            type: 'string',
        },
        fromNodeCode: {
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
        toNodeCode: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
