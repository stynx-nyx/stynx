/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { JsonObject } from '../models/JsonObject';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ReferenceProbesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceProbesGetProbesDataTxHandler(): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_probes/data-tx',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns JsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceProbesPostProbesIdempotencyIdempotency(): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/_probes/idempotency',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns JsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceProbesGetProbesRatelimitHandler({
        warm,
    }: {
        warm?: string,
    }): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_probes/ratelimit',
            query: {
                'warm': warm,
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
     * @returns JsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceProbesGetProbesReadonlyWriteHandler(): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_probes/readonly-write',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
