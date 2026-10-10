/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $BulkFlowAnswerWriteDto = {
    properties: {
        answers: {
            type: 'array',
            contains: {
                type: 'FlowAnswerWriteDto',
            },
            isRequired: true,
        },
    },
} as const;
