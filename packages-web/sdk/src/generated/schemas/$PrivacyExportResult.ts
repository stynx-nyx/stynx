/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $PrivacyExportResult = {
    properties: {
        downloadUrl: {
            type: 'string',
            isRequired: true,
        },
        expiresInSeconds: {
            type: 'number',
            isRequired: true,
        },
        exportId: {
            type: 'string',
            isRequired: true,
        },
        objectKey: {
            type: 'string',
            isRequired: true,
        },
        tables: {
            type: 'array',
            contains: {
                properties: {
                    archiveRows: {
                        type: 'number',
                        isRequired: true,
                    },
                    liveRows: {
                        type: 'number',
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
    },
} as const;
