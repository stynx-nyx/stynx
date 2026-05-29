/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { CreateFlowWaiverDto } from '../models/CreateFlowWaiverDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateFlowWaiverDto } from '../models/UpdateFlowWaiverDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowWaiversService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowWaiversGetFlowWaiversList(): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/waivers',
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
    public flowWaiversPostFlowWaiversCreate({
        requestBody,
    }: {
        requestBody: CreateFlowWaiverDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/waivers',
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
    public flowWaiversDeleteFlowWaiversByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/waivers/{id}',
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
    public flowWaiversPatchFlowWaiversByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowWaiverDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/waivers/{id}',
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
