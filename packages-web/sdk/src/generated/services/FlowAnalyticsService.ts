/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowAnalyticsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowAnalyticsGetFlowAnalyticsDashboardDashboard(): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/analytics/dashboard',
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
    public flowAnalyticsGetFlowOpenTasksOpenTasks(): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/open-tasks',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
