/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionItemResult = {
  properties: {
    errorCode: {
      type: 'string',
    },
    guarantee: {
      type: 'SessionGuarantee',
      isRequired: true,
    },
    sid: {
      type: 'string',
      isRequired: true,
    },
    status: {
      type: 'MutationStatus',
      isRequired: true,
    },
  },
} as const;
