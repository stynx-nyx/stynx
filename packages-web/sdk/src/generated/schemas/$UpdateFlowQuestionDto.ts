/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $UpdateFlowQuestionDto = {
    properties: {
        blocksSubmit: {
            type: 'boolean',
        },
        fieldType: {
            type: 'FlowQuestionFieldType',
        },
        key: {
            type: 'string',
        },
        label: {
            type: 'string',
        },
        meta: {
            type: 'FlowJsonObject',
        },
        options: {
            type: 'array',
            contains: {
                type: 'JsonValue',
            },
        },
        required: {
            type: 'boolean',
        },
        sortOrder: {
            type: 'number',
        },
        validators: {
            type: 'FlowJsonObject',
        },
        visibleIf: {
            type: 'FlowJsonObject',
        },
    },
} as const;
