/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NumberingConsumptionEntry } from './NumberingConsumptionEntry';
import type { NumberingReservationStatus } from './NumberingReservationStatus';
export type NumberingConsumptionResult = {
  consumption: Array<NumberingConsumptionEntry>;
  reservationId: string;
  status: NumberingReservationStatus;
};
