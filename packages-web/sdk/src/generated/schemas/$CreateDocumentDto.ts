/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $CreateDocumentDto = {
    properties: {
        byteSize: {
            type: 'number',
            isRequired: true,
        },
        checksumSha256: {
            type: 'string',
            isRequired: true,
        },
        classification: {
            type: 'string',
        },
        collection: {
            type: 'string',
            isRequired: true,
        },
        filename: {
            type: 'string',
            isRequired: true,
        },
        mimeType: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
