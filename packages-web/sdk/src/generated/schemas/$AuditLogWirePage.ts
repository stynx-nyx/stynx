/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $AuditLogWirePage = {
  properties: {
    items: {
      type: 'array',
      contains: {
        type: 'AuditLogWireItem',
      },
      isRequired: true,
    },
    nextCursor: {
      type: 'string',
    },
  },
} as const;
