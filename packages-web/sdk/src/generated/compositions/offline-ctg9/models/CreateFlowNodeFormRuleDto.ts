/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowJsonObject } from './FlowJsonObject';
import type { FlowNodeFormGatingMode } from './FlowNodeFormGatingMode';
export type CreateFlowNodeFormRuleDto = {
    applicability?: FlowJsonObject;
    formId: string;
    gatingMode?: FlowNodeFormGatingMode;
    meta?: FlowJsonObject;
    nodeId: string;
    required?: boolean;
    threshold?: string;
    weight?: string;
};

