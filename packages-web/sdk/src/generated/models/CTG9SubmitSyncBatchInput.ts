/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CTG9SyncBatchItemInput } from './CTG9SyncBatchItemInput';
export type CTG9SubmitSyncBatchInput = {
  agentId?: string;
  batchSequence?: number | null;
  deviceBatchId: string;
  deviceId: string;
  items: Array<CTG9SyncBatchItemInput>;
  orgUnitId: string;
};
