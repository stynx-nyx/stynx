/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $ProvisionTenantResult = {
    properties: {
        invitationToken: {
            type: 'string',
            isRequired: true,
        },
        ownerUserId: {
            type: 'string',
            isRequired: true,
        },
        tenant: {
            type: 'TenantDetail',
            isRequired: true,
        },
    },
} as const;
