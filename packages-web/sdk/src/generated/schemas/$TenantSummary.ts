/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $TenantSummary = {
    properties: {
        createdAt: {
            type: 'string',
            isRequired: true,
        },
        id: {
            type: 'string',
            isRequired: true,
        },
        isActive: {
            type: 'boolean',
            isRequired: true,
        },
        name: {
            type: 'string',
            isRequired: true,
        },
        slug: {
            type: 'string',
            isRequired: true,
        },
        state: {
            type: 'TenantState',
            isRequired: true,
        },
        updatedAt: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
