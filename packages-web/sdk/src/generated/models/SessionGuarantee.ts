/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { InvalidationGuarantee } from './InvalidationGuarantee';
export type SessionGuarantee = {
    accessTokenExpiresAt: (string | null);
    effectiveBy: (string | null);
    kind: InvalidationGuarantee;
    propagationBoundSeconds: (number | null);
};

