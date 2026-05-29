/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { JsonObject } from '../models/JsonObject';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { SessionBundle } from '../models/SessionBundle';
import type { SessionExchangeBody } from '../models/SessionExchangeBody';
import type { SessionSwitchBody } from '../models/SessionSwitchBody';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class StynxAuthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public stynxAuthGetPlatformPermsBySidInspect({
        sid,
    }: {
        sid: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_platform/perms/{sid}',
            path: {
                'sid': sid,
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
    public stynxAuthPostPlatformPermsBySidInvalidateHandler({
        sid,
    }: {
        sid: string,
    }): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/_platform/perms/{sid}/invalidate',
            path: {
                'sid': sid,
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
     * @returns SessionBundle OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public stynxAuthPostSessionsHandler({
        requestBody,
    }: {
        requestBody: SessionExchangeBody,
    }): CancelablePromise<SessionBundle | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/sessions',
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
     * @returns JsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public stynxAuthPostSessionsLogoutHandler(): CancelablePromise<JsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/sessions/logout',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns SessionBundle OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public stynxAuthPostSessionsSwitchHandler({
        requestBody,
    }: {
        requestBody: SessionSwitchBody,
    }): CancelablePromise<SessionBundle | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/sessions/switch',
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
