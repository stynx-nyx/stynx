/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateFlowScopeDto } from '../models/CreateFlowScopeDto';
import type { FlowJsonObject } from '../models/FlowJsonObject';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowScopeDto } from '../models/UpdateFlowScopeDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowScopesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowScopesGetFlowScopesList(): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/scopes',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowScopesPostFlowScopesCreate({
        requestBody,
    }: {
        requestBody: CreateFlowScopeDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/scopes',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowScopesDeleteFlowScopesByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/scopes/{id}',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowScopesGetFlowScopesByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/scopes/{id}',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowScopesPatchFlowScopesByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowScopeDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/scopes/{id}',
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
