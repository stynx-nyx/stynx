/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionView = {
    properties: {
        client: {
            type: 'string',
        },
        current: {
            type: 'boolean',
            isRequired: true,
        },
        deviceLabel: {
            type: 'string',
        },
        guarantee: {
            type: 'UnknownJson',
            isRequired: true,
        },
        location: {
            properties: {
                country: {
                    type: 'string',
                },
                region: {
                    type: 'string',
                },
            },
        },
        sessionId: {
            type: 'string',
            isRequired: true,
        },
        userAgent: {
            type: 'string',
        },
    },
} as const;
