/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { FlowTaskActionDto } from '../models/FlowTaskActionDto';
import type { FlowTaskAssignmentDto } from '../models/FlowTaskAssignmentDto';
import type { FlowTaskNoteDto } from '../models/FlowTaskNoteDto';
import type { JsonValue } from '../models/JsonValue';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowTasksService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns JsonValue OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowTasksGetFlowTasksList(): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/tasks',
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
    public flowTasksGetFlowTasksByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/tasks/{id}',
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
    public flowTasksPostFlowTasksByIdAcceptAccept({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskNoteDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/accept',
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
    public flowTasksPostFlowTasksByIdActAct({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskActionDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/act',
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
    public flowTasksPostFlowTasksByIdAssignAssign({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskAssignmentDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/assign',
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
    public flowTasksGetFlowTasksByIdCandidatesCandidates({
        id,
    }: {
        id: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/tasks/{id}/candidates',
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
    public flowTasksPostFlowTasksByIdDeclineDecline({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskNoteDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/decline',
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
    public flowTasksPostFlowTasksByIdUnacceptUnaccept({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskNoteDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/unaccept',
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
    public flowTasksPostFlowTasksByIdUnassignUnassign({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskNoteDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/unassign',
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
    public flowTasksPostFlowTasksByIdWithdrawWithdraw({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: FlowTaskNoteDto,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/tasks/{id}/withdraw',
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
    public flowTasksGetFlowTasksRolesByRoleUsersUsersByRole({
        role,
        search,
    }: {
        role: string,
        search?: string,
    }): CancelablePromise<Array<Record<string, JsonValue>> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/tasks/roles/{role}/users',
            path: {
                'role': role,
            },
            query: {
                'search': search,
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
    public flowTasksGetFlowTasksUsersByIdUser({
        id,
    }: {
        id: string,
    }): CancelablePromise<Record<string, JsonValue> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/tasks/users/{id}',
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
