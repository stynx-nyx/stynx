/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { CreateFlowFillDto } from '../models/CreateFlowFillDto';
import type { CreateFlowFormDto } from '../models/CreateFlowFormDto';
import type { CreateFlowQuestionDto } from '../models/CreateFlowQuestionDto';
import type { CreateFlowWaiverDto } from '../models/CreateFlowWaiverDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowFormDto } from '../models/UpdateFlowFormDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowFormsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowFormsGetFlowFormsList({
        scopeId,
    }: {
        scopeId?: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms',
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
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowFormsPostFlowFormsCreate({
        requestBody,
    }: {
        requestBody: CreateFlowFormDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/forms',
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
    public flowFormsGetFlowFormsByFormIdFillsFills({
        formId,
    }: {
        formId: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms/{formId}/fills',
            path: {
                'formId': formId,
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
    public flowFormsPostFlowFormsByFormIdFillsCreateFill({
        formId,
        requestBody,
    }: {
        formId: string,
        requestBody: CreateFlowFillDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/forms/{formId}/fills',
            path: {
                'formId': formId,
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
    public flowFormsGetFlowFormsByFormIdFillsByFillIdFillDetail({
        formId,
        fillId,
    }: {
        formId: string,
        fillId: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms/{formId}/fills/{fillId}',
            path: {
                'formId': formId,
                'fillId': fillId,
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
    public flowFormsGetFlowFormsByFormIdFillsByFillIdAnswersFillAnswers({
        formId,
        fillId,
    }: {
        formId: string,
        fillId: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms/{formId}/fills/{fillId}/answers',
            path: {
                'formId': formId,
                'fillId': fillId,
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
    public flowFormsGetFlowFormsByFormIdFillsByFillIdWaiversFillWaivers({
        formId,
        fillId,
    }: {
        formId: string,
        fillId: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms/{formId}/fills/{fillId}/waivers',
            path: {
                'formId': formId,
                'fillId': fillId,
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
    public flowFormsPostFlowFormsByFormIdFillsByFillIdWaiversCreateFillWaiver({
        formId,
        fillId,
        requestBody,
    }: {
        formId: string,
        fillId: string,
        requestBody: CreateFlowWaiverDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/forms/{formId}/fills/{fillId}/waivers',
            path: {
                'formId': formId,
                'fillId': fillId,
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
    public flowFormsGetFlowFormsByFormIdQuestionsQuestions({
        formId,
    }: {
        formId: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms/{formId}/questions',
            path: {
                'formId': formId,
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
    public flowFormsPostFlowFormsByFormIdQuestionsCreateQuestion({
        formId,
        requestBody,
    }: {
        formId: string,
        requestBody: CreateFlowQuestionDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/forms/{formId}/questions',
            path: {
                'formId': formId,
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
    public flowFormsDeleteFlowFormsByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/forms/{id}',
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
    public flowFormsGetFlowFormsByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/forms/{id}',
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
    public flowFormsPatchFlowFormsByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowFormDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/forms/{id}',
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
