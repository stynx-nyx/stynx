/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionExchangeBody = {
    properties: {
        cognitoToken: {
            type: 'string',
        },
        deviceMeta: {
            type: 'dictionary',
            contains: {
                type: 'JsonValue',
            },
        },
    },
} as const;
