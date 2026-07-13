/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UnknownJson } from './UnknownJson';
export type SessionView = {
    client?: string;
    current: boolean;
    deviceLabel?: string;
    guarantee: UnknownJson;
    location?: {
        country?: string;
        region?: string;
    };
    sessionId: string;
    userAgent?: string;
};

