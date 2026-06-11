/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProblemDetails } from '../models/ProblemDetails';
import type { TenantOverrideUpdateInput } from '../models/TenantOverrideUpdateInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class I18NService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns string OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public i18NGetTenancyI18NOverridesListOverrides(): CancelablePromise<Record<string, string> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_tenancy/i18n/overrides',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns string OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public i18NPutTenancyI18NOverridesUpdateOverrides({
        requestBody,
    }: {
        requestBody: TenantOverrideUpdateInput,
    }): CancelablePromise<Record<string, string> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/_tenancy/i18n/overrides',
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
