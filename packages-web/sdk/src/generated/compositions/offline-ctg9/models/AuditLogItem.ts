/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from './JsonValue';
export type AuditLogItem = {
    actorId?: (string | null);
    id: number;
    occurredAt: string;
    operation: string;
    payload: Record<string, JsonValue>;
    requestId?: (string | null);
    rowId?: (string | null);
    sessionId?: (string | null);
    tableName: string;
    tableSchema: string;
    tags: Record<string, JsonValue>;
    tenantId?: (string | null);
};

