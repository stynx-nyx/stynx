/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowFillStatus } from './FlowFillStatus';
export type CreateFlowFillDto = {
    formId: string;
    nodeRunId?: string;
    runId?: string;
    scopeId: string;
    status?: FlowFillStatus;
    targetId: string;
    targetType: string;
    taskId?: string;
};

