/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowJsonObject } from './FlowJsonObject';
export type CreateFlowEdgeDto = {
    action?: string;
    fromNodeId: string;
    graphId: string;
    meta?: FlowJsonObject;
    rule?: string;
    sortOrder?: number;
    spawn?: boolean;
    toNodeId: string;
};

