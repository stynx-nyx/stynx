/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CancelNumberingReservationInput } from '../models/CancelNumberingReservationInput';
import type { CTG9NumberingReservation } from '../models/CTG9NumberingReservation';
import type { CTG9ReserveNumberingInput } from '../models/CTG9ReserveNumberingInput';
import type { JsonValue } from '../models/JsonValue';
import type { NumberingConsumptionResult } from '../models/NumberingConsumptionResult';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { ReconcileNumberingInput } from '../models/ReconcileNumberingInput';
import type { ReconcileNumberingResult } from '../models/ReconcileNumberingResult';
import type { ResolveSyncConflictInput } from '../models/ResolveSyncConflictInput';
import type { SettleNumberingInput } from '../models/SettleNumberingInput';
import type { SubmitSyncBatchInput } from '../models/SubmitSyncBatchInput';
import type { SyncBatchReceipt } from '../models/SyncBatchReceipt';
import type { SyncConflict } from '../models/SyncConflict';
import type { SyncItemReceipt } from '../models/SyncItemReceipt';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class Ctg9OfflineSyncService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}
  /**
   * @returns SyncConflict OK
   * @returns ProblemDetails Unexpected error
   * @throws ApiError
   */
  public ctg9OfflineSyncPostOfflineSyncConflictsByIdResolveResolveConflict({
    id,
    requestBody,
  }: {
    id: string;
    requestBody: ResolveSyncConflictInput;
  }): CancelablePromise<SyncConflict | ProblemDetails> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/offline-sync/conflicts/{id}/resolve',
      path: {
        id: id,
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
  public ctg9OfflineSyncPostOfflineSyncNumberingReservationsReserveNumbering({
    requestBody,
  }: {
    requestBody: CTG9ReserveNumberingInput;
  }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
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
   * @returns CTG9NumberingReservation OK
   * @returns ProblemDetails Unexpected error
   * @throws ApiError
   */
  public ctg9OfflineSyncPostOfflineSyncNumberingReservationsByIdBlockBlockNumbering({
    id,
    requestBody,
  }: {
    id: string;
    requestBody: CancelNumberingReservationInput;
  }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/offline-sync/numbering-reservations/{id}/block',
      path: {
        id: id,
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
  public ctg9OfflineSyncPostOfflineSyncNumberingReservationsByIdCancelCancelNumbering({
    id,
    requestBody,
  }: {
    id: string;
    requestBody: CancelNumberingReservationInput;
  }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/offline-sync/numbering-reservations/{id}/cancel',
      path: {
        id: id,
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
    id: string;
    requestBody: CancelNumberingReservationInput;
  }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/offline-sync/numbering-reservations/{id}/close',
      path: {
        id: id,
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
    id: string;
  }): CancelablePromise<NumberingConsumptionResult | ProblemDetails> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/offline-sync/numbering-reservations/{id}/consumption',
      path: {
        id: id,
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
    id: string;
    requestBody: ReconcileNumberingInput;
  }): CancelablePromise<ReconcileNumberingResult | ProblemDetails> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/offline-sync/numbering-reservations/{id}/reconcile',
      path: {
        id: id,
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
    id: string;
    requestBody: SettleNumberingInput;
  }): CancelablePromise<CTG9NumberingReservation | ProblemDetails> {
    return this.httpRequest.request({
      method: 'POST',
      url: '/offline-sync/numbering-reservations/{id}/settle',
      path: {
        id: id,
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
   * @returns JsonValue OK
   * @returns ProblemDetails Unexpected error
   * @throws ApiError
   */
  public ctg9OfflineSyncPostOfflineSyncSyncBatchesSubmitBatch({
    requestBody,
  }: {
    requestBody: SubmitSyncBatchInput;
  }): CancelablePromise<JsonValue | ProblemDetails> {
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
  /**
   * @returns SyncBatchReceipt OK
   * @returns ProblemDetails Unexpected error
   * @throws ApiError
   */
  public ctg9OfflineSyncGetOfflineSyncSyncBatchesByDeviceIdByDeviceBatchIdReceiptGetBatchReceipt({
    deviceId,
    deviceBatchId,
  }: {
    deviceId: string;
    deviceBatchId: string;
  }): CancelablePromise<SyncBatchReceipt | ProblemDetails> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/offline-sync/sync-batches/{deviceId}/{deviceBatchId}/receipt',
      path: {
        deviceId: deviceId,
        deviceBatchId: deviceBatchId,
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
    idempotencyKey: string;
  }): CancelablePromise<SyncItemReceipt | ProblemDetails> {
    return this.httpRequest.request({
      method: 'GET',
      url: '/offline-sync/sync-items/{idempotencyKey}/receipt',
      path: {
        idempotencyKey: idempotencyKey,
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
