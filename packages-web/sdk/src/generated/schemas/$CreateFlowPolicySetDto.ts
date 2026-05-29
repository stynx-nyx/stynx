/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $CreateFlowPolicySetDto = {
    properties: {
        description: {
            type: 'string',
        },
        isActive: {
            type: 'boolean',
        },
        meta: {
            type: 'FlowJsonObject',
        },
        name: {
            type: 'string',
        },
        scopeId: {
            type: 'string',
            isRequired: true,
        },
        version: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
