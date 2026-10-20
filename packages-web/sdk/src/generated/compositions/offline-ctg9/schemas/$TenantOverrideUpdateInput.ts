/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $TenantOverrideUpdateInput = {
  properties: {
    catalog: {
      type: 'dictionary',
      contains: {
        type: 'string',
      },
      isRequired: true,
    },
    locale: {
      type: 'string',
      isRequired: true,
    },
  },
} as const;
