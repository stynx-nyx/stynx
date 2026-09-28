/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UnknownJson } from './UnknownJson';
export type SyncBatchReceipt = {
    batchSequence: (number | null);
    deviceBatchId: string;
    deviceId: string;
    items: UnknownJson;
    responseBodyBytes: (Blob | null);
    responseHeaders: Record<string, string>;
    responseStatus: (number | null);
    status: 'open' | 'closed' | 'legacy_closed_unverified';
};

