/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SubmitSyncBatchInput = {
  properties: {
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
        type: 'SyncBatchItemInput',
      },
      isRequired: true,
    },
    orgUnitId: {
      type: 'string',
      isRequired: true,
    },
  },
} as const;
