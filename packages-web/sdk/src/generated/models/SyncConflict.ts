/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { OfflineSyncConflictResolutionStrategy } from './OfflineSyncConflictResolutionStrategy';
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
    tenantId: string;
};

