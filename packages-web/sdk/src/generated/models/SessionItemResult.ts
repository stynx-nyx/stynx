/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MutationStatus } from './MutationStatus';
import type { SessionGuarantee } from './SessionGuarantee';
export type SessionItemResult = {
    errorCode?: string;
    guarantee: SessionGuarantee;
    sid: string;
    status: MutationStatus;
};

