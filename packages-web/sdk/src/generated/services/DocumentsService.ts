/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { CompleteDocumentDto } from '../models/CompleteDocumentDto';
import type { CreateDocumentDto } from '../models/CreateDocumentDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class DocumentsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public documentsPostDocumentsHandler({
        requestBody,
    }: {
        requestBody: CreateDocumentDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/documents',
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
    public documentsDeleteDocumentsByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/documents/{id}',
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
    public documentsPostDocumentsByIdCompleteComplete({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: CompleteDocumentDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/documents/{id}/complete',
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
    public documentsGetDocumentsByIdDownloadDownload({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/documents/{id}/download',
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
    public documentsDeleteDocumentsByIdHardHardDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/documents/{id}/hard',
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
    public documentsPostDocumentsByIdRestoreRestore({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/documents/{id}/restore',
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
