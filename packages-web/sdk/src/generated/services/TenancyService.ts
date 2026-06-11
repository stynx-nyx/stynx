/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ArchiveTenantResult } from '../models/ArchiveTenantResult';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { ProvisionTenantInput } from '../models/ProvisionTenantInput';
import type { ProvisionTenantResult } from '../models/ProvisionTenantResult';
import type { PurgeTenantResult } from '../models/PurgeTenantResult';
import type { SuspendTenantInput } from '../models/SuspendTenantInput';
import type { SuspendTenantResult } from '../models/SuspendTenantResult';
import type { TenantDetail } from '../models/TenantDetail';
import type { TenantSummary } from '../models/TenantSummary';
import type { UpdateTenantInput } from '../models/UpdateTenantInput';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class TenancyService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns TenantSummary OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyGetTenantsList(): CancelablePromise<Array<TenantSummary> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/tenants',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns ProvisionTenantResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyPostTenantsCreate({
        requestBody,
    }: {
        requestBody: ProvisionTenantInput,
    }): CancelablePromise<ProvisionTenantResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/tenants',
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
     * @returns TenantDetail OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyGetTenantsByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<TenantDetail | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/tenants/{id}',
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
     * @returns TenantDetail OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyPatchTenantsByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateTenantInput,
    }): CancelablePromise<TenantDetail | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/tenants/{id}',
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
     * @returns ArchiveTenantResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyPostTenantsByIdArchiveArchive({
        id,
    }: {
        id: string,
    }): CancelablePromise<ArchiveTenantResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/tenants/{id}/archive',
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
     * @returns PurgeTenantResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyPostTenantsByIdPurgePurge({
        id,
    }: {
        id: string,
    }): CancelablePromise<PurgeTenantResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/tenants/{id}/purge',
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
     * @returns SuspendTenantResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public tenancyPostTenantsByIdSuspendSuspend({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: SuspendTenantInput,
    }): CancelablePromise<SuspendTenantResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/tenants/{id}/suspend',
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
}
