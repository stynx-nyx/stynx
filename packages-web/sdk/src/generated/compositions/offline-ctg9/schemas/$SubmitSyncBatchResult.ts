/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SubmitSyncBatchResult = {
  properties: {
    acceptedItems: {
      type: 'number',
      isRequired: true,
    },
    batchId: {
      type: 'string',
      isRequired: true,
    },
    conflicts: {
      type: 'array',
      contains: {
        type: 'string',
      },
      isRequired: true,
    },
    duplicateItems: {
      type: 'number',
      isRequired: true,
    },
    items: {
      type: 'array',
      contains: {
        type: 'StoredSyncQueueItem',
      },
      isRequired: true,
    },
  },
} as const;
