/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $FlowGraphImportNode = {
    properties: {
        allowedActions: {
            type: 'array',
            contains: {
                type: 'string',
            },
        },
        code: {
            type: 'string',
            isRequired: true,
        },
        decisionPolicy: {
            type: 'string',
        },
        entryRule: {
            type: 'string',
        },
        exitRule: {
            type: 'string',
        },
        kind: {
            type: 'string',
            isRequired: true,
        },
        meta: {
            type: 'FlowJsonObject',
        },
        name: {
            type: 'string',
        },
        quorumRatio: {
            type: 'string',
        },
        slaSeconds: {
            type: 'number',
        },
        sortOrder: {
            type: 'number',
        },
    },
} as const;
