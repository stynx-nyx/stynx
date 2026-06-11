/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CreateRecordNoteDto } from '../models/CreateRecordNoteDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { UpdateRecordNoteDto } from '../models/UpdateRecordNoteDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class RecordNotesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public recordNotesGetRecordNotesList(): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/record-notes',
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
    public recordNotesPostRecordNotesCreate({
        requestBody,
    }: {
        requestBody: CreateRecordNoteDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/record-notes',
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
    public recordNotesDeleteRecordNotesByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/record-notes/{id}',
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
    public recordNotesGetRecordNotesByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/record-notes/{id}',
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
    public recordNotesPatchRecordNotesByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateRecordNoteDto,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/record-notes/{id}',
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
    public recordNotesDeleteRecordNotesByIdHardHardDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/record-notes/{id}/hard',
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
    public recordNotesPostRecordNotesByIdRestoreRestore({
        id,
    }: {
        id: string,
    }): CancelablePromise<JsonValue | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/record-notes/{id}/restore',
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
