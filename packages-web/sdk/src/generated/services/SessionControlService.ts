/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EmptySessionControlRequest } from '../models/EmptySessionControlRequest';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { SessionMutationResult } from '../models/SessionMutationResult';
import type { SessionSubjectRevokeRequest } from '../models/SessionSubjectRevokeRequest';
import type { SessionView } from '../models/SessionView';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class SessionControlService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns SessionMutationResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlPostAuthSessionAdministrationSubjectsBySubjectIdRevokeHandler({
        subjectId,
        requestBody,
    }: {
        subjectId: string,
        requestBody: SessionSubjectRevokeRequest,
    }): CancelablePromise<SessionMutationResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/auth/session-administration/subjects/{subjectId}/revoke',
            path: {
                'subjectId': subjectId,
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
     * @returns SessionMutationResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlGetAuthSessionOperationsByOperationIdHandler({
        operationId,
    }: {
        operationId: string,
    }): CancelablePromise<SessionMutationResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/auth/session-operations/{operationId}',
            path: {
                'operationId': operationId,
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
     * @returns SessionView OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlGetAuthSessionsHandler(): CancelablePromise<Array<SessionView> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/auth/sessions',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns SessionMutationResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlDeleteAuthSessionsBySidHandler({
        sid,
    }: {
        sid: string,
    }): CancelablePromise<SessionMutationResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/auth/sessions/{sid}',
            path: {
                'sid': sid,
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
     * @returns SessionMutationResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlPostAuthSessionsLogoutCurrentHandler({
        requestBody,
    }: {
        requestBody: EmptySessionControlRequest,
    }): CancelablePromise<SessionMutationResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/auth/sessions/logout-current',
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
     * @returns SessionMutationResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlPostAuthSessionsRevokeAllHandler({
        requestBody,
    }: {
        requestBody: EmptySessionControlRequest,
    }): CancelablePromise<SessionMutationResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/auth/sessions/revoke-all',
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
     * @returns SessionMutationResult OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public sessionControlPostAuthSessionsRevokeOthersHandler({
        requestBody,
    }: {
        requestBody: EmptySessionControlRequest,
    }): CancelablePromise<SessionMutationResult | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/auth/sessions/revoke-others',
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
