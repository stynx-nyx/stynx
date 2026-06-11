/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateFlowAgentRuleDto } from '../models/CreateFlowAgentRuleDto';
import type { CreateFlowNodeFormRuleDto } from '../models/CreateFlowNodeFormRuleDto';
import type { FlowJsonObject } from '../models/FlowJsonObject';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowNodeDto } from '../models/UpdateFlowNodeDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowNodesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowNodesDeleteFlowNodesByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/nodes/{id}',
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
    public flowNodesGetFlowNodesByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/nodes/{id}',
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
    public flowNodesPatchFlowNodesByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowNodeDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/nodes/{id}',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowNodesGetFlowNodesByNodeIdAgentRulesListAgentRules({
        nodeId,
    }: {
        nodeId: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/nodes/{nodeId}/agent-rules',
            path: {
                'nodeId': nodeId,
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
    public flowNodesPostFlowNodesByNodeIdAgentRulesCreateAgentRule({
        nodeId,
        requestBody,
    }: {
        nodeId: string,
        requestBody: CreateFlowAgentRuleDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/nodes/{nodeId}/agent-rules',
            path: {
                'nodeId': nodeId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowNodesGetFlowNodesByNodeIdFormRulesListFormRules({
        nodeId,
    }: {
        nodeId: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/nodes/{nodeId}/form-rules',
            path: {
                'nodeId': nodeId,
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
    public flowNodesPostFlowNodesByNodeIdFormRulesCreateFormRule({
        nodeId,
        requestBody,
    }: {
        nodeId: string,
        requestBody: CreateFlowNodeFormRuleDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/nodes/{nodeId}/form-rules',
            path: {
                'nodeId': nodeId,
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
