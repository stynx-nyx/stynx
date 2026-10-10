/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PrivacyPartitionRetentionItem = {
    properties: {
        dropped: {
            type: 'boolean',
            isRequired: true,
        },
        monthEnd: {
            type: 'string',
            isRequired: true,
        },
        partition: {
            type: 'string',
            isRequired: true,
        },
        reason: {
            type: 'string',
            isRequired: true,
        },
        table: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
