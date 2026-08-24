/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelNumberingReservationInput } from '../models/CancelNumberingReservationInput';
import type { NumberingReservation } from '../models/NumberingReservation';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { ReserveNumberingInput } from '../models/ReserveNumberingInput';
import type { ResolveSyncConflictInput } from '../models/ResolveSyncConflictInput';
import type { SubmitSyncBatchInput } from '../models/SubmitSyncBatchInput';
import type { SubmitSyncBatchResult } from '../models/SubmitSyncBatchResult';
import type { SyncConflict } from '../models/SyncConflict';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class OfflineSyncService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns SyncConflict OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public offlineSyncPostOfflineSyncConflictsByIdResolveResolveConflict({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: ResolveSyncConflictInput,
    }): CancelablePromise<SyncConflict | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/conflicts/{id}/resolve',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns NumberingReservation OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public offlineSyncPostOfflineSyncNumberingReservationsReserveNumbering({
        requestBody,
    }: {
        requestBody: ReserveNumberingInput,
    }): CancelablePromise<NumberingReservation | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/numbering-reservations',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns NumberingReservation OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public offlineSyncPostOfflineSyncNumberingReservationsByIdCancelCancelNumbering({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: CancelNumberingReservationInput,
    }): CancelablePromise<NumberingReservation | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/numbering-reservations/{id}/cancel',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns SubmitSyncBatchResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public offlineSyncPostOfflineSyncSyncBatchesSubmitBatch({
        requestBody,
    }: {
        requestBody: SubmitSyncBatchInput,
    }): CancelablePromise<SubmitSyncBatchResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/sync-batches',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
