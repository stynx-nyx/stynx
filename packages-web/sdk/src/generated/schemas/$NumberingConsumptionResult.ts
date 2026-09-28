/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export const $NumberingConsumptionResult = {
    properties: {
        consumption: {
            type: 'UnknownJson',
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
    },
} as const;
