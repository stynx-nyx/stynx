/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type NumberingReservation = {
    agentId: string;
    deviceId: string;
    endNumber: number;
    entityType: string;
    nextNumber: number;
    orgUnitId: string;
    rangeId: string;
    reservationId: string;
    series: string;
    shiftId: string;
    startNumber: number;
    status: 'reserved' | 'consumed' | 'expired' | 'cancelled';
    tenantId: string;
    validUntil: string;
};

