/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $UpdateRecordNoteDto = {
    properties: {
        code: {
            type: 'string',
        },
        detail: {
            type: 'string',
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
        },
        label: {
            type: 'string',
        },
        locale: {
            type: 'string',
        },
        region: {
            type: 'string',
        },
    },
} as const;
