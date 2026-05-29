/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $BulkFlowAnswerWriteRequestDto = {
    type: 'any-of',
    contains: [{
        type: 'array',
        contains: {
            type: 'FlowAnswerWriteDto',
        },
    }, {
        type: 'BulkFlowAnswerWriteDto',
    }],
} as const;
