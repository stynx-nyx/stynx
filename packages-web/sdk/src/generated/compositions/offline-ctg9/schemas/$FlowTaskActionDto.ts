/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $FlowTaskActionDto = {
    properties: {
        action: {
            type: 'string',
            isRequired: true,
        },
        note: {
            type: 'string',
        },
        payload: {
            type: 'any-of',
            contains: [{
                type: 'FlowJsonObject',
            }, {
                type: 'null',
            }],
        },
    },
} as const;
