/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { StoredSyncQueueItem } from './StoredSyncQueueItem';
export type SubmitSyncBatchResult = {
  acceptedItems: number;
  batchId: string;
  conflicts: Array<string>;
  duplicateItems: number;
  items: Array<StoredSyncQueueItem>;
};
