/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class SessionJwksService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns any OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionJwksGetWellKnownJwksJsonHandler(): CancelablePromise<{
        keys: Array<(Record<string, string> & {
            alg: string;
            kid: string;
            use: string;
        })>;
    } | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/.well-known/jwks.json',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
