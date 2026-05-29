/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $CreateFlowQuestionDto = {
    properties: {
        blocksSubmit: {
            type: 'boolean',
        },
        fieldType: {
            type: 'FlowQuestionFieldType',
            isRequired: true,
        },
        formId: {
            type: 'string',
            isRequired: true,
        },
        key: {
            type: 'string',
            isRequired: true,
        },
        label: {
            type: 'string',
            isRequired: true,
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
