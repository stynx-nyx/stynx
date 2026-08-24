/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SyncConflict = {
    properties: {
        conflictId: {
            type: 'string',
            isRequired: true,
        },
        conflictType: {
            type: 'string',
            isRequired: true,
        },
        description: {
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
        queueItemId: {
            type: 'string',
            isRequired: true,
        },
        resolution: {
            type: 'OfflineSyncConflictResolutionStrategy',
        },
        resolvedAt: {
            type: 'string',
        },
        resolvedBy: {
            type: 'string',
        },
        status: {
            type: 'Enum',
            isRequired: true,
        },
        tenantId: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
