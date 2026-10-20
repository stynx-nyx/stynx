/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $AuditLogPage = {
  properties: {
    items: {
      type: 'array',
      contains: {
        type: 'AuditLogItem',
      },
      isRequired: true,
    },
    nextCursor: {
      type: 'string',
    },
  },
} as const;
