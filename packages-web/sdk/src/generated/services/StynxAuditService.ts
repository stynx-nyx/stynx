/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { AuditLogPage } from '../models/AuditLogPage';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class StynxAuditService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns AuditLogPage OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public stynxAuditGetAuditLogList(): CancelablePromise<AuditLogPage | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/_audit/log',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
}
