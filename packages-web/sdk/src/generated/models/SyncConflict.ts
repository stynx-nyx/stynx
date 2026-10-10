/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OfflineSyncConflictResolutionStrategy } from './OfflineSyncConflictResolutionStrategy';
import type { OfflineSyncStynxContext } from './OfflineSyncStynxContext';
export type SyncConflict = {
    conflictId: string;
    conflictType: string;
    description: string;
    localEntityId: string;
    payloadHash: string;
    queueItemId: string;
    resolution?: OfflineSyncConflictResolutionStrategy;
    resolvedAt?: string;
    resolvedBy?: string;
    status: 'open' | 'resolved';
    stynx?: OfflineSyncStynxContext;
    tenantId: string;
};

