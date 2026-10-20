/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PrivacyRetentionTarget } from './PrivacyRetentionTarget';
import type { PrivacyStrategy } from './PrivacyStrategy';
export type PrivacyRetentionPlanItem = {
  affectedRows: number;
  reason: string;
  strategy: PrivacyStrategy;
  table: string;
  target: PrivacyRetentionTarget;
};
