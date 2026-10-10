/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateRecordNoteDto = {
    properties: {
        code: {
            type: 'string',
            isRequired: true,
        },
        detail: {
            type: 'string',
            isRequired: true,
        },
        detail2: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        kind: {
            type: 'Enum',
            isRequired: true,
        },
        label: {
            type: 'string',
            isRequired: true,
        },
        locale: {
            type: 'string',
        },
        recordId: {
            type: 'string',
            isRequired: true,
        },
        region: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
