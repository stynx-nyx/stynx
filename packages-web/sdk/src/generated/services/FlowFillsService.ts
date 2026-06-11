/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BulkFlowAnswerWriteRequestDto } from '../models/BulkFlowAnswerWriteRequestDto';
import type { CreateFlowFillDto } from '../models/CreateFlowFillDto';
import type { CreateFlowWaiverDto } from '../models/CreateFlowWaiverDto';
import type { FlowAnswerWriteDto } from '../models/FlowAnswerWriteDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowFillDto } from '../models/UpdateFlowFillDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowFillsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowFillsGetFlowFillsList(): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/fills',
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
    public flowFillsPostFlowFillsCreate({
        requestBody,
    }: {
        requestBody: CreateFlowFillDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/fills',
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
    public flowFillsGetFlowFillsByFillIdAnswersAnswers({
        fillId,
    }: {
        fillId: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/fills/{fillId}/answers',
            path: {
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
    public flowFillsPostFlowFillsByFillIdAnswersUpsertAnswer({
        fillId,
        requestBody,
    }: {
        fillId: string,
        requestBody: FlowAnswerWriteDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/fills/{fillId}/answers',
            path: {
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
    public flowFillsPutFlowFillsByFillIdAnswersBulkUpsertAnswers({
        fillId,
        requestBody,
    }: {
        fillId: string,
        requestBody: BulkFlowAnswerWriteRequestDto,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/flow/fills/{fillId}/answers',
            path: {
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
    public flowFillsGetFlowFillsByFillIdWaiversWaivers({
        fillId,
    }: {
        fillId: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/fills/{fillId}/waivers',
            path: {
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
    public flowFillsPostFlowFillsByFillIdWaiversCreateWaiver({
        fillId,
        requestBody,
    }: {
        fillId: string,
        requestBody: CreateFlowWaiverDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/fills/{fillId}/waivers',
            path: {
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
    public flowFillsDeleteFlowFillsByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/fills/{id}',
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
    public flowFillsGetFlowFillsByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/fills/{id}',
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
    public flowFillsPatchFlowFillsByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowFillDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/fills/{id}',
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
