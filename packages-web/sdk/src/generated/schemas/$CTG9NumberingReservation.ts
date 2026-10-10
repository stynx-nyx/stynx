/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $CTG9NumberingReservation = {
    properties: {
        agentId: {
            type: 'string',
            isRequired: true,
        },
        deviceId: {
            type: 'string',
            isRequired: true,
        },
        endNumber: {
            type: 'number',
            isRequired: true,
        },
        entityType: {
            type: 'string',
            isRequired: true,
        },
        nextNumber: {
            type: 'number',
            isRequired: true,
        },
        orgUnitId: {
            type: 'string',
            isRequired: true,
        },
        rangeId: {
            type: 'string',
            isRequired: true,
        },
        reservationId: {
            type: 'string',
            isRequired: true,
        },
        series: {
            type: 'string',
            isRequired: true,
        },
        shiftId: {
            type: 'any-of',
            contains: [{
                type: 'string',
            }, {
                type: 'null',
            }],
            isRequired: true,
        },
        startNumber: {
            type: 'number',
            isRequired: true,
        },
        status: {
            type: 'NumberingReservationStatus',
            isRequired: true,
        },
        tenantId: {
            type: 'string',
            isRequired: true,
        },
        validUntil: {
            type: 'string',
            isRequired: true,
        },
    },
} as const;
