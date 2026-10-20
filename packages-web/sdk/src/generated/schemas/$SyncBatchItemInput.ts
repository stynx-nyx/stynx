/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SyncBatchItemInput = {
  properties: {
    createdLocallyAt: {
      type: 'string',
      isRequired: true,
    },
    entityType: {
      type: 'string',
      isRequired: true,
    },
    idempotencyKey: {
      type: 'string',
      isRequired: true,
    },
    localEntityId: {
      type: 'string',
      isRequired: true,
    },
    payloadHash: {
      type: 'string',
      isRequired: true,
    },
    payloadJson: {
      type: 'dictionary',
      contains: {
        type: 'JsonValue',
      },
      isRequired: true,
    },
    queueItemId: {
      type: 'string',
      isRequired: true,
    },
    reservedNumber: {
      type: 'number',
    },
  },
} as const;
