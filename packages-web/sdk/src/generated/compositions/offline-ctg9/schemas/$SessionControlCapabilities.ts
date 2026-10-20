/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionControlCapabilities = {
  properties: {
    controlScopes: {
      type: 'array',
      contains: {
        type: 'SessionScope',
      },
      isRequired: true,
    },
    identityGlobalAuthority: {
      type: 'boolean',
      isRequired: true,
    },
    listScopes: {
      type: 'array',
      contains: {
        type: 'SessionScope',
      },
      isRequired: true,
    },
    localEnforcement: {
      type: 'Enum',
      isRequired: true,
    },
    providerConfirmation: {
      type: 'boolean',
      isRequired: true,
    },
    retryReconciliation: {
      type: 'boolean',
      isRequired: true,
    },
    revokeAll: {
      type: 'boolean',
      isRequired: true,
    },
    revokeOne: {
      type: 'boolean',
      isRequired: true,
    },
    revokeOthers: {
      type: 'boolean',
      isRequired: true,
    },
    sharedAnchorBlastRadius: {
      type: 'boolean',
      isRequired: true,
    },
    stableSessionIdentity: {
      type: 'boolean',
      isRequired: true,
    },
  },
} as const;
