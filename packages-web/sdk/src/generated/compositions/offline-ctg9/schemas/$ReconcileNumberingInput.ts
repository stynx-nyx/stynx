/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $ReconcileNumberingInput = {
  properties: {
    claimedNumbers: {
      type: 'array',
      contains: {
        type: 'number',
      },
    },
    idempotencyKey: {
      type: 'string',
    },
    userRef: {
      type: 'string',
    },
  },
} as const;
