/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateWorkItemLockDto } from '../models/CreateWorkItemLockDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateWorkItemLockDto } from '../models/UpdateWorkItemLockDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class WorkItemLocksService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public workItemLocksGetWorkItemLocksList(): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/work-item-locks',
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
    public workItemLocksPostWorkItemLocksCreate({
        requestBody,
    }: {
        requestBody: CreateWorkItemLockDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/work-item-locks',
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
    public workItemLocksDeleteWorkItemLocksByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/work-item-locks/{id}',
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
    public workItemLocksGetWorkItemLocksByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/work-item-locks/{id}',
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
    public workItemLocksPatchWorkItemLocksByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateWorkItemLockDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/work-item-locks/{id}',
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
    public workItemLocksDeleteWorkItemLocksByIdHardHardDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/work-item-locks/{id}/hard',
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
    public workItemLocksPostWorkItemLocksByIdRestoreRestore({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/work-item-locks/{id}/restore',
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
