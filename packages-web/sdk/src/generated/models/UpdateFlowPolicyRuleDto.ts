/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { FlowJsonObject } from './FlowJsonObject';
import type { FlowPolicyEffect } from './FlowPolicyEffect';
export type UpdateFlowPolicyRuleDto = {
    action?: string;
    capability?: string;
    conditions?: FlowJsonObject;
    effect?: FlowPolicyEffect;
    meta?: FlowJsonObject;
    nodeCode?: string;
    priority?: number;
    reasonCode?: string;
    statusCode?: string;
};

