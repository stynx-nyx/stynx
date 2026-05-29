/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { FlowJsonObject } from '../models/FlowJsonObject';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowAgentRuleDto } from '../models/UpdateFlowAgentRuleDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowAgentRulesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowAgentRulesDeleteFlowAgentRulesByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/agent-rules/{id}',
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
    public flowAgentRulesGetFlowAgentRulesByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/agent-rules/{id}',
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
    public flowAgentRulesPatchFlowAgentRulesByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowAgentRuleDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/agent-rules/{id}',
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
