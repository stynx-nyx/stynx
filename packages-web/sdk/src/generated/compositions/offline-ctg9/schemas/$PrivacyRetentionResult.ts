/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PrivacyRetentionResult = {
    properties: {
        actions: {
            type: 'array',
            contains: {
                type: 'PrivacyRetentionPlanItem',
            },
            isRequired: true,
        },
        dryRun: {
            type: 'boolean',
            isRequired: true,
        },
        partitions: {
            type: 'array',
            contains: {
                type: 'PrivacyPartitionRetentionItem',
            },
            isRequired: true,
        },
    },
} as const;
