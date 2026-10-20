/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FlowJsonObject } from './FlowJsonObject';
import type { FlowNodeFormGatingMode } from './FlowNodeFormGatingMode';
export type UpdateFlowNodeFormRuleDto = {
  applicability?: FlowJsonObject;
  gatingMode?: FlowNodeFormGatingMode;
  meta?: FlowJsonObject;
  required?: boolean;
  threshold?: string;
  weight?: string;
};
