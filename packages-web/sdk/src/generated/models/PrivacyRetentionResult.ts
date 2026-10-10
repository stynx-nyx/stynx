/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PrivacyPartitionRetentionItem } from './PrivacyPartitionRetentionItem';
import type { PrivacyRetentionPlanItem } from './PrivacyRetentionPlanItem';
export type PrivacyRetentionResult = {
    actions: Array<PrivacyRetentionPlanItem>;
    dryRun: boolean;
    partitions: Array<PrivacyPartitionRetentionItem>;
};

