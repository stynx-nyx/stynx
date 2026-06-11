/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowDecisionPolicy } from './FlowDecisionPolicy';
import type { FlowJsonObject } from './FlowJsonObject';
import type { FlowNodeKind } from './FlowNodeKind';
export type UpdateFlowNodeDto = {
    allowedActions?: Array<string>;
    code?: string;
    decisionPolicy?: FlowDecisionPolicy;
    entryRule?: string;
    exitRule?: string;
    kind?: FlowNodeKind;
    meta?: FlowJsonObject;
    name?: string;
    quorumRatio?: string;
    slaSeconds?: number;
    sortOrder?: number;
};

