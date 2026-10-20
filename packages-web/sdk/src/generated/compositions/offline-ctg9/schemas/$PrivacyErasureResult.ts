/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PrivacyErasureResult = {
  properties: {
    actions: {
      type: 'array',
      contains: {
        properties: {
          archiveAffected: {
            type: 'number',
            isRequired: true,
          },
          column: {
            type: 'string',
            isRequired: true,
          },
          liveAffected: {
            type: 'number',
            isRequired: true,
          },
          strategy: {
            type: 'PrivacyStrategy',
            isRequired: true,
          },
          table: {
            type: 'string',
            isRequired: true,
          },
        },
      },
      isRequired: true,
    },
    subjectUserId: {
      type: 'string',
      isRequired: true,
    },
  },
} as const;
