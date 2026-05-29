/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
export const $AuditLogItem = {
    properties: {
        actorId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        id: {
            type: 'number',
            isRequired: true,
        },
        occurredAt: {
            type: 'string',
            isRequired: true,
        },
        operation: {
            type: 'string',
            isRequired: true,
        },
        payload: {
            type: 'dictionary',
            contains: {
                type: 'JsonValue',
            },
            isRequired: true,
        },
        requestId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        rowId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        sessionId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
        tableName: {
            type: 'string',
            isRequired: true,
        },
        tableSchema: {
            type: 'string',
            isRequired: true,
        },
        tags: {
            type: 'dictionary',
            contains: {
                type: 'JsonValue',
            },
            isRequired: true,
        },
        tenantId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
        },
    },
} as const;
