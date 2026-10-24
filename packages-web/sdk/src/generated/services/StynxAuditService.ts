/* generated using stynx-sdk-codegen (@stynx-nyx/sdk) -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuditLogWirePage } from '../models/AuditLogWirePage';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class StynxAuditService {
  constructor(public readonly httpRequest: BaseHttpRequest) {}
  /**
   * @returns AuditLogWirePage OK
   * @returns ProblemDetails Unexpected error
   * @throws ApiError
   */
  public stynxAuditGetAuditLogList(): CancelablePromise<AuditLogWirePage | ProblemDetails> {
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
