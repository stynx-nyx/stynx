/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PrivacyRetentionPlanItem = {
    properties: {
        affectedRows: {
            type: 'number',
            isRequired: true,
        },
        reason: {
            type: 'string',
            isRequired: true,
        },
        strategy: {
            type: 'PrivacyStrategy',
            isRequired: true,
        },
        table: {
            type: 'string',
            isRequired: true,
        },
        target: {
            type: 'PrivacyRetentionTarget',
            isRequired: true,
        },
    },
} as const;
