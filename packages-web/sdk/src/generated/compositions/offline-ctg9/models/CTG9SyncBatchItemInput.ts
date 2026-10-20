/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
export type CTG9SyncBatchItemInput = {
  createdLocallyAt: string;
  entityType: string;
  idempotencyKey?: string;
  localEntityId: string;
  payloadHash: string;
  payloadJson: Record<string, JsonValue>;
  queueItemId: string;
  reservationId?: string;
  reservedNumber?: number;
};
