/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { DemoTenant } from '../models/DemoTenant';
import type { DevLoginBody } from '../models/DevLoginBody';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { SessionBundle } from '../models/SessionBundle';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class ReferenceDevAuthService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceDevAuthGetReferenceAuthVerifyHandler(): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_reference/auth-verify',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns DemoTenant OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceDevAuthGetReferenceDemoTenantsListDemoTenants(): CancelablePromise<Array<DemoTenant> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_reference/demo-tenants',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns any OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public referenceDevAuthPostReferenceDevLoginLogin({
        requestBody,
    }: {
        requestBody: DevLoginBody,
    }): CancelablePromise<(SessionBundle & {
        email: string;
        permissions: Array<string>;
        tenantId: string;
    }) | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/_reference/dev-login',
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
