/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowWaiverDto = {
    properties: {
        expiresAt: {
            type: 'string',
        },
        formId: {
            type: 'string',
            isRequired: true,
        },
        questionId: {
            type: 'string',
        },
        reason: {
            type: 'string',
            isRequired: true,
        },
        scopeId: {
            type: 'string',
            isRequired: true,
        },
        targetId: {
            type: 'string',
            isRequired: true,
        },
        targetType: {
            type: 'string',
            isRequired: true,
        },
        waivedBy: {
            type: 'string',
        },
    },
} as const;
