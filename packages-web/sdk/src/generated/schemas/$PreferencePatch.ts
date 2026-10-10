/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $PreferencePatch = {
  properties: {
    accessibility: {
      type: 'any-of',
      contains: [
        {
          properties: {
            largeText: {
              type: 'any-of',
              contains: [
                {
                  type: 'boolean',
                },
                {
                  type: 'null',
                },
              ],
            },
            reduceMotion: {
              type: 'any-of',
              contains: [
                {
                  type: 'boolean',
                },
                {
                  type: 'null',
                },
              ],
            },
            screenReaderOptimized: {
              type: 'any-of',
              contains: [
                {
                  type: 'boolean',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        {
          type: 'null',
        },
      ],
    },
    locale: {
      type: 'any-of',
      contains: [
        {
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
        },
        {
          type: 'null',
        },
      ],
    },
    notificationDelivery: {
      type: 'any-of',
      contains: [
        {
          properties: {
            email: {
              type: 'any-of',
              contains: [
                {
                  type: 'boolean',
                },
                {
                  type: 'null',
                },
              ],
            },
            inApp: {
              type: 'any-of',
              contains: [
                {
                  type: 'boolean',
                },
                {
                  type: 'null',
                },
              ],
            },
            push: {
              type: 'any-of',
              contains: [
                {
                  type: 'boolean',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        {
          type: 'null',
        },
      ],
    },
    theme: {
      type: 'any-of',
      contains: [
        {
          properties: {
            colorScheme: {
              type: 'any-of',
              contains: [
                {
                  type: 'Enum',
                },
                {
                  type: 'null',
                },
              ],
            },
            contrast: {
              type: 'any-of',
              contains: [
                {
                  type: 'Enum',
                },
                {
                  type: 'null',
                },
              ],
            },
            density: {
              type: 'any-of',
              contains: [
                {
                  type: 'Enum',
                },
                {
                  type: 'null',
                },
              ],
            },
          },
        },
        {
          type: 'null',
        },
      ],
    },
  },
} as const;
