/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CreateWorkItemLockDto = {
    amountUnits: number;
    externalRef?: (string | null);
    lockedAt: string;
    reason: 'manual' | 'external' | 'review' | 'hold';
    workItemId: string;
};

