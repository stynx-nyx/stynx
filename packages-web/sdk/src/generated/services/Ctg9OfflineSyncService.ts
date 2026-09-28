/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelNumberingReservationInput } from '../models/CancelNumberingReservationInput';
import type { CTG9NumberingReservation } from '../models/CTG9NumberingReservation';
import type { NumberingConsumptionResult } from '../models/NumberingConsumptionResult';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { ReconcileNumberingInput } from '../models/ReconcileNumberingInput';
import type { ReconcileNumberingResult } from '../models/ReconcileNumberingResult';
import type { SettleNumberingInput } from '../models/SettleNumberingInput';
import type { SyncBatchReceipt } from '../models/SyncBatchReceipt';
import type { SyncItemReceipt } from '../models/SyncItemReceipt';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class Ctg9OfflineSyncService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns CTG9NumberingReservation OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncPostOfflineSyncNumberingReservationsByIdBlockBlockNumbering({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: CancelNumberingReservationInput,
    }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/numbering-reservations/{id}/block',
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
     * @returns CTG9NumberingReservation OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncPostOfflineSyncNumberingReservationsByIdCloseCloseNumbering({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: CancelNumberingReservationInput,
    }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/numbering-reservations/{id}/close',
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
     * @returns NumberingConsumptionResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncGetOfflineSyncNumberingReservationsByIdConsumptionGetConsumption({
        id,
    }: {
        id: string,
    }): CancelablePromise<NumberingConsumptionResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/offline-sync/numbering-reservations/{id}/consumption',
            path: {
                'id': id,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns ReconcileNumberingResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncPostOfflineSyncNumberingReservationsByIdReconcileReconcileNumbering({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: ReconcileNumberingInput,
    }): CancelablePromise<ReconcileNumberingResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/numbering-reservations/{id}/reconcile',
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
     * @returns CTG9NumberingReservation OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncPostOfflineSyncNumberingReservationsByIdSettleSettleNumbering({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: SettleNumberingInput,
    }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/offline-sync/numbering-reservations/{id}/settle',
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
     * @returns SyncBatchReceipt OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncGetOfflineSyncSyncBatchesByDeviceIdByDeviceBatchIdReceiptGetBatchReceipt({
        deviceId,
        deviceBatchId,
    }: {
        deviceId: string,
        deviceBatchId: string,
    }): CancelablePromise<SyncBatchReceipt | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/offline-sync/sync-batches/{deviceId}/{deviceBatchId}/receipt',
            path: {
                'deviceId': deviceId,
                'deviceBatchId': deviceBatchId,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns SyncItemReceipt OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public ctg9OfflineSyncGetOfflineSyncSyncItemsByIdempotencyKeyReceiptGetItemReceipt({
        idempotencyKey,
    }: {
        idempotencyKey: string,
    }): CancelablePromise<SyncItemReceipt | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/offline-sync/sync-items/{idempotencyKey}/receipt',
            path: {
                'idempotencyKey': idempotencyKey,
            },
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
