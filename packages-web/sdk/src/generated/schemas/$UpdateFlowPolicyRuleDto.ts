/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $UpdateFlowPolicyRuleDto = {
  properties: {
    action: {
      type: 'string',
    },
    capability: {
      type: 'string',
    },
    conditions: {
      type: 'FlowJsonObject',
    },
    effect: {
      type: 'FlowPolicyEffect',
    },
    meta: {
      type: 'FlowJsonObject',
    },
    nodeCode: {
      type: 'string',
    },
    priority: {
      type: 'number',
    },
    reasonCode: {
      type: 'string',
    },
    statusCode: {
      type: 'string',
    },
  },
} as const;
