/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PreferencesDocument = {
    properties: {
        revision: {
            type: 'number',
            isRequired: true,
        },
        updatedAt: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        values: {
            type: 'PreferenceValues',
            isRequired: true,
        },
    },
} as const;
