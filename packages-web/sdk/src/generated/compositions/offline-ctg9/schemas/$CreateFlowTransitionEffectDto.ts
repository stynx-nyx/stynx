/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CreateFlowTransitionEffectDto = {
  properties: {
    action: {
      type: 'string',
    },
    effectKey: {
      type: 'string',
      isRequired: true,
    },
    graphId: {
      type: 'string',
      isRequired: true,
    },
    nodeCode: {
      type: 'string',
    },
    payload: {
      type: 'FlowJsonObject',
    },
    sortOrder: {
      type: 'number',
    },
  },
} as const;
