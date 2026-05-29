/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { CreateFlowPolicyRuleDto } from '../models/CreateFlowPolicyRuleDto';
import type { CreateFlowPolicySetDto } from '../models/CreateFlowPolicySetDto';
import type { FlowJsonObject } from '../models/FlowJsonObject';
import type { FlowPolicyEvaluationDto } from '../models/FlowPolicyEvaluationDto';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowPolicyRuleDto } from '../models/UpdateFlowPolicyRuleDto';
import type { UpdateFlowPolicySetDto } from '../models/UpdateFlowPolicySetDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowPoliciesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowPoliciesPostFlowPoliciesEvaluateEvaluate({
        requestBody,
    }: {
        requestBody: FlowPolicyEvaluationDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/policies/evaluate',
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
    public flowPoliciesDeleteFlowPoliciesRulesByIdDeleteRule({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/policies/rules/{id}',
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
    public flowPoliciesGetFlowPoliciesRulesByIdGetRule({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/policies/rules/{id}',
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
    public flowPoliciesPatchFlowPoliciesRulesByIdUpdateRule({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowPolicyRuleDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/policies/rules/{id}',
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
    public flowPoliciesGetFlowPoliciesSetsListSets({
        scopeId,
    }: {
        scopeId?: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/policies/sets',
            query: {
                'scopeId': scopeId,
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
    public flowPoliciesPostFlowPoliciesSetsCreateSet({
        requestBody,
    }: {
        requestBody: CreateFlowPolicySetDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/policies/sets',
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
    public flowPoliciesDeleteFlowPoliciesSetsByIdDeleteSet({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/policies/sets/{id}',
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
    public flowPoliciesGetFlowPoliciesSetsByIdGetSet({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/policies/sets/{id}',
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
    public flowPoliciesPatchFlowPoliciesSetsByIdUpdateSet({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowPolicySetDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/policies/sets/{id}',
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
    public flowPoliciesGetFlowPoliciesSetsByPolicySetIdRulesListRules({
        policySetId,
    }: {
        policySetId: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/policies/sets/{policySetId}/rules',
            path: {
                'policySetId': policySetId,
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
    public flowPoliciesPostFlowPoliciesSetsByPolicySetIdRulesCreateRule({
        policySetId,
        requestBody,
    }: {
        policySetId: string,
        requestBody: CreateFlowPolicyRuleDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/policies/sets/{policySetId}/rules',
            path: {
                'policySetId': policySetId,
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
