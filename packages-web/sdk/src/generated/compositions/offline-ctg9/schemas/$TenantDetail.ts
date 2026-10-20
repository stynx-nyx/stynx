/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $TenantDetail = {
  properties: {
    archivedAt: {
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
    createdAt: {
      type: 'string',
      isRequired: true,
    },
    id: {
      type: 'string',
      isRequired: true,
    },
    isActive: {
      type: 'boolean',
      isRequired: true,
    },
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
      isRequired: true,
    },
    settings: {
      type: 'dictionary',
      contains: {
        type: 'JsonValue',
      },
      isRequired: true,
    },
    slug: {
      type: 'string',
      isRequired: true,
    },
    state: {
      type: 'TenantState',
      isRequired: true,
    },
    suspendedReason: {
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
    updatedAt: {
      type: 'string',
      isRequired: true,
    },
  },
} as const;
