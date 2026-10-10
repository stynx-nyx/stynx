/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NumberingConsumptionEntry } from './NumberingConsumptionEntry';
import type { NumberingReservationStatus } from './NumberingReservationStatus';
export type ReconcileNumberingResult = {
    consumption: Array<NumberingConsumptionEntry>;
    missingOnServer: Array<number>;
    reservationId: string;
    status: NumberingReservationStatus;
    unexpectedOnServer: Array<number>;
};

