/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $SuspendTenantResult = {
    properties: {
        activeSessionCount: {
            type: 'number',
            isRequired: true,
        },
        tenant: {
            type: 'TenantDetail',
            isRequired: true,
        },
    },
} as const;
