/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MutationStatus } from './MutationStatus';
import type { SessionAction } from './SessionAction';
import type { SessionGuarantee } from './SessionGuarantee';
import type { SessionItemResult } from './SessionItemResult';
import type { SessionScope } from './SessionScope';
export type SessionMutationResult = {
    action: SessionAction;
    effectiveBy: (string | null);
    errorCode?: string;
    guarantee: SessionGuarantee;
    operationId: string;
    results: Array<SessionItemResult>;
    scope: SessionScope;
    status: MutationStatus;
};

