/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { CreateWorkItemEntryDto } from '../models/CreateWorkItemEntryDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateWorkItemEntryDto } from '../models/UpdateWorkItemEntryDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class WorkItemEntriesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public workItemEntriesGetWorkItemEntriesList(): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/work-item-entries',
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
    public workItemEntriesPostWorkItemEntriesCreate({
        requestBody,
    }: {
        requestBody: CreateWorkItemEntryDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/work-item-entries',
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
    public workItemEntriesDeleteWorkItemEntriesByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/work-item-entries/{id}',
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
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public workItemEntriesGetWorkItemEntriesByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/work-item-entries/{id}',
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
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public workItemEntriesPatchWorkItemEntriesByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateWorkItemEntryDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/work-item-entries/{id}',
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
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public workItemEntriesDeleteWorkItemEntriesByIdHardHardDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/work-item-entries/{id}/hard',
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
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public workItemEntriesPostWorkItemEntriesByIdRestoreRestore({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/work-item-entries/{id}/restore',
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
}
