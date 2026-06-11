/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowAnswerDto } from '../models/UpdateFlowAnswerDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowAnswersService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowAnswersDeleteFlowAnswersByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/answers/{id}',
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
    public flowAnswersPatchFlowAnswersByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowAnswerDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/answers/{id}',
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
