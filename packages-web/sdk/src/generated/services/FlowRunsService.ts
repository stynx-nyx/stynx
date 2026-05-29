/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { EnsureFlowRunDto } from '../models/EnsureFlowRunDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowRunDto } from '../models/UpdateFlowRunDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowRunsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowRunsGetFlowRunsList(): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs',
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
    public flowRunsGetFlowRunsByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/{id}',
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
    public flowRunsPatchFlowRunsByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowRunDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/runs/{id}',
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
    public flowRunsGetFlowRunsByIdActivityActivity({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/{id}/activity',
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
    public flowRunsGetFlowRunsByIdEventsListEvents({
        id,
    }: {
        id: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/{id}/events',
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
    public flowRunsGetFlowRunsByIdFactsFacts({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/{id}/facts',
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
    public flowRunsGetFlowRunsByIdNodesListNodeRuns({
        id,
    }: {
        id: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/{id}/nodes',
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
    public flowRunsGetFlowRunsByIdTasksListTasks({
        id,
    }: {
        id: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/{id}/tasks',
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
    public flowRunsPostFlowRunsEnsureEnsure({
        requestBody,
    }: {
        requestBody: EnsureFlowRunDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/runs/ensure',
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
    public flowRunsGetFlowRunsSummarySummary(): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/runs/summary',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
