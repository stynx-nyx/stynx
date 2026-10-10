/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $StoredSyncQueueItem = {
  properties: {
    agentId: {
      type: 'string',
      isRequired: true,
    },
    createdLocallyAt: {
      type: 'string',
      isRequired: true,
    },
    deviceId: {
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
    orgUnitId: {
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
    receivedAt: {
      type: 'string',
      isRequired: true,
    },
    reservedNumber: {
      type: 'number',
    },
    status: {
      type: 'OfflineSyncQueueStatus',
      isRequired: true,
    },
    tenantId: {
      type: 'string',
      isRequired: true,
    },
  },
} as const;
