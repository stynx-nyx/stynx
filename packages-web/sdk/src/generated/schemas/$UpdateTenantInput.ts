/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $UpdateTenantInput = {
  properties: {
    locale: {
      type: 'any-of',
      contains: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
    },
    name: {
      type: 'string',
    },
    settings: {
      type: 'dictionary',
      contains: {
        type: 'JsonValue',
      },
    },
    slug: {
      type: 'string',
    },
    timezone: {
      type: 'any-of',
      contains: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
    },
  },
} as const;
