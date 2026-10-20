/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $BulkFlowAnswerWriteRequestDto = {
  type: 'any-of',
  contains: [
    {
      type: 'array',
      contains: {
        type: 'FlowAnswerWriteDto',
      },
    },
    {
      type: 'BulkFlowAnswerWriteDto',
    },
  ],
} as const;
