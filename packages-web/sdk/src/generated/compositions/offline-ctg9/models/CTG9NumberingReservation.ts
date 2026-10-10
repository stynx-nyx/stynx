/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { NumberingReservationStatus } from './NumberingReservationStatus';
export type CTG9NumberingReservation = {
  agentId: string;
  deviceId: string;
  endNumber: number;
  entityType: string;
  nextNumber: number;
  orgUnitId: string;
  rangeId: string;
  reservationId: string;
  series: string;
  shiftId: string | null;
  startNumber: number;
  status: NumberingReservationStatus;
  tenantId: string;
  validUntil: string;
};
