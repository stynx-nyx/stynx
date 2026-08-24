/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $ReserveNumberingInput = {
    properties: {
        deviceId: {
            type: 'string',
            isRequired: true,
        },
        entityType: {
            type: 'string',
            isRequired: true,
        },
        orgUnitId: {
            type: 'string',
            isRequired: true,
        },
        rangeId: {
            type: 'string',
        },
        requestedSize: {
            type: 'number',
            isRequired: true,
        },
        series: {
            type: 'string',
        },
        shiftId: {
            type: 'string',
            isRequired: true,
        },
        validUntil: {
            type: 'string',
        },
    },
} as const;
