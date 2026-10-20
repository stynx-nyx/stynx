/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CTG9SubmitSyncBatchInput = {
  properties: {
    agentId: {
      type: 'string',
    },
    batchSequence: {
      type: 'any-of',
      contains: [
        {
          type: 'number',
        },
        {
          type: 'null',
        },
      ],
    },
    deviceBatchId: {
      type: 'string',
      isRequired: true,
    },
    deviceId: {
      type: 'string',
      isRequired: true,
    },
    items: {
      type: 'array',
      contains: {
        type: 'CTG9SyncBatchItemInput',
      },
      isRequired: true,
    },
    orgUnitId: {
      type: 'string',
      isRequired: true,
    },
  },
} as const;
