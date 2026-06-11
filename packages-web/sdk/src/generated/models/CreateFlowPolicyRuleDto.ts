/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowJsonObject } from './FlowJsonObject';
import type { FlowPolicyEffect } from './FlowPolicyEffect';
export type CreateFlowPolicyRuleDto = {
    action?: string;
    capability?: string;
    conditions?: FlowJsonObject;
    effect: FlowPolicyEffect;
    meta?: FlowJsonObject;
    nodeCode?: string;
    policySetId: string;
    priority?: number;
    reasonCode?: string;
    statusCode?: string;
};

