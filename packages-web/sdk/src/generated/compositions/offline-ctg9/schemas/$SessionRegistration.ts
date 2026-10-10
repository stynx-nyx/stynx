/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionRegistration = {
  properties: {
    anchorId: {
      type: 'string',
      isRequired: true,
    },
    capabilities: {
      type: 'SessionControlCapabilities',
      isRequired: true,
    },
    createdAt: {
      type: 'string',
      isRequired: true,
    },
    expiresAt: {
      type: 'any-of',
      contains: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
      isRequired: true,
    },
    guarantee: {
      type: 'SessionGuarantee',
      isRequired: true,
    },
    lastSeenAt: {
      type: 'any-of',
      contains: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
      isRequired: true,
    },
    metadata: {
      type: 'SessionDisplayMetadata',
      isRequired: true,
    },
    provider: {
      type: 'string',
      isRequired: true,
    },
    sharedAnchor: {
      type: 'boolean',
      isRequired: true,
    },
    sid: {
      type: 'string',
      isRequired: true,
    },
    state: {
      type: 'RegistrationState',
      isRequired: true,
    },
    subjectId: {
      type: 'string',
      isRequired: true,
    },
    tenantId: {
      type: 'string',
      isRequired: true,
    },
    terminalAt: {
      type: 'any-of',
      contains: [
        {
          type: 'string',
        },
        {
          type: 'null',
        },
      ],
      isRequired: true,
    },
  },
} as const;
