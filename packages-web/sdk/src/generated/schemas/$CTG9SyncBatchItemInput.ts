/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CTG9SyncBatchItemInput = {
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
    reservationId: {
      type: 'string',
    },
    reservedNumber: {
      type: 'number',
    },
  },
} as const;
