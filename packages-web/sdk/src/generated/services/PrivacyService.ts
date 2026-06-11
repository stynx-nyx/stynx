/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PrivacyErasureRequest } from '../models/PrivacyErasureRequest';
import type { PrivacyErasureResult } from '../models/PrivacyErasureResult';
import type { PrivacyExportRequest } from '../models/PrivacyExportRequest';
import type { PrivacyExportResult } from '../models/PrivacyExportResult';
import type { PrivacyRetentionResult } from '../models/PrivacyRetentionResult';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PrivacyService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns PrivacyErasureResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public privacyPostPrivacyErasuresEraseSubject({
        requestBody,
    }: {
        requestBody: PrivacyErasureRequest,
    }): CancelablePromise<PrivacyErasureResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/privacy/erasures',
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
     * @returns PrivacyExportResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public privacyPostPrivacyExportsExportData({
        requestBody,
    }: {
        requestBody: PrivacyExportRequest,
    }): CancelablePromise<PrivacyExportResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/privacy/exports',
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
     * @returns PrivacyRetentionResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public privacyGetPrivacyRetentionApplyRetention({
        dryRun,
    }: {
        dryRun?: string,
    }): CancelablePromise<PrivacyRetentionResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/privacy/retention',
            query: {
                'dryRun': dryRun,
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
