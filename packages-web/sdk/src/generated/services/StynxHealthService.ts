/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { JsonObject } from '../models/JsonObject';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class StynxHealthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public stynxHealthGetHealthzLiveness(): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/healthz',
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
    public stynxHealthGetInfoInfo(): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/info',
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
    public stynxHealthGetMetricsHandler(): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/metrics',
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
    public stynxHealthGetReadyzHandler(): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/readyz',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
