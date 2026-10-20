/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NumberingConsumptionEntry } from './NumberingConsumptionEntry';
import type { NumberingReservationStatus } from './NumberingReservationStatus';
export type ReconcileNumberingResult = {
  consumption: Array<NumberingConsumptionEntry>;
  missingOnServer: Array<number>;
  reconciliationId?: string;
  reservationId: string;
  status: NumberingReservationStatus;
  unexpectedOnServer: Array<number>;
};
