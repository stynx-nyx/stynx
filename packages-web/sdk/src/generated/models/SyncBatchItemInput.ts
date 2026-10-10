/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
export type SyncBatchItemInput = {
  createdLocallyAt: string;
  entityType: string;
  idempotencyKey: string;
  localEntityId: string;
  payloadHash: string;
  payloadJson: Record<string, JsonValue>;
  queueItemId: string;
  reservedNumber?: number;
};
