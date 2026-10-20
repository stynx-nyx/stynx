/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $FlowGraphImportDocument = {
  properties: {
    agentRules: {
      type: 'array',
      contains: {
        type: 'dictionary',
        contains: {
          type: 'JsonValue',
        },
      },
    },
    edges: {
      type: 'array',
      contains: {
        type: 'FlowGraphImportEdge',
      },
    },
    graph: {
      type: 'FlowJsonObject',
      isRequired: true,
    },
    nodeFormRules: {
      type: 'array',
      contains: {
        type: 'dictionary',
        contains: {
          type: 'JsonValue',
        },
      },
    },
    nodes: {
      type: 'array',
      contains: {
        type: 'FlowGraphImportNode',
      },
      isRequired: true,
    },
    transitionEffects: {
      type: 'array',
      contains: {
        type: 'FlowJsonObject',
      },
    },
  },
} as const;
