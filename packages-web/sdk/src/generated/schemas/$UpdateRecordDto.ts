/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $UpdateRecordDto = {
  properties: {
    email: {
      type: 'string',
    },
    externalRef: {
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
    ownerUserId: {
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
    status: {
      type: 'Enum',
    },
    title: {
      type: 'string',
    },
  },
} as const;
