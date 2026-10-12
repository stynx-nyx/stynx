/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $SessionView = {
  properties: {
    capabilities: {
      type: 'SessionControlCapabilities',
      isRequired: true,
    },
    client: {
      type: 'string',
    },
    createdAt: {
      type: 'string',
      isRequired: true,
    },
    current: {
      type: 'boolean',
      isRequired: true,
    },
    deviceLabel: {
      type: 'string',
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
      properties: {
        effectiveBy: {
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
        kind: {
          type: 'InvalidationGuarantee',
          isRequired: true,
        },
        propagationBoundSeconds: {
          type: 'any-of',
          contains: [
            {
              type: 'number',
            },
            {
              type: 'null',
            },
          ],
          isRequired: true,
        },
      },
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
    location: {
      properties: {
        country: {
          type: 'string',
        },
        region: {
          type: 'string',
        },
      },
    },
    provider: {
      type: 'string',
      isRequired: true,
    },
    sessionId: {
      type: 'string',
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
    userAgent: {
      type: 'string',
    },
  },
} as const;
