/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PrivacyStrategy } from './PrivacyStrategy';
export type PrivacyErasureResult = {
  actions: Array<{
    archiveAffected: number;
    column: string;
    liveAffected: number;
    strategy: PrivacyStrategy;
    table: string;
  }>;
  subjectUserId: string;
};
