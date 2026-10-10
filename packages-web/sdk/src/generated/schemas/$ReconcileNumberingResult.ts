/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $ReconcileNumberingResult = {
    properties: {
        consumption: {
            type: 'array',
            contains: {
                type: 'NumberingConsumptionEntry',
            },
            isRequired: true,
        },
        missingOnServer: {
            type: 'array',
            contains: {
                type: 'number',
            },
            isRequired: true,
        },
        reservationId: {
            type: 'string',
            isRequired: true,
        },
        status: {
            type: 'NumberingReservationStatus',
            isRequired: true,
        },
        unexpectedOnServer: {
            type: 'array',
            contains: {
                type: 'number',
            },
            isRequired: true,
        },
    },
} as const;
