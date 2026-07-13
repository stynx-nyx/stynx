/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { PlatformProfile } from '../models/PlatformProfile';
import type { PreferencePatch } from '../models/PreferencePatch';
import type { PreferencesDocument } from '../models/PreferencesDocument';
import type { PreferenceValues } from '../models/PreferenceValues';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { ProfilePatch } from '../models/ProfilePatch';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PreferencesService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns PlatformProfile OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesGetProfileHandler(): CancelablePromise<PlatformProfile | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/profile',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns PlatformProfile OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesPatchProfileHandler({
        requestBody,
    }: {
        requestBody: ProfilePatch,
    }): CancelablePromise<PlatformProfile | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/profile',
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
     * @returns PreferencesDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesDeleteProfilePreferencesHandler(): CancelablePromise<PreferencesDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/profile/preferences',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns PreferencesDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesGetProfilePreferencesHandler(): CancelablePromise<PreferencesDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/profile/preferences',
            errors: {
                400: `Bad request`,
                401: `Unauthorized`,
                403: `Forbidden`,
                404: `Not found`,
            },
        });
    }
    /**
     * @returns PreferencesDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesPatchProfilePreferencesHandler({
        requestBody,
    }: {
        requestBody: PreferencePatch,
    }): CancelablePromise<PreferencesDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/profile/preferences',
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
     * @returns PreferencesDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesPutProfilePreferencesHandler({
        requestBody,
    }: {
        requestBody: PreferenceValues,
    }): CancelablePromise<PreferencesDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PUT',
            url: '/profile/preferences',
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
     * @returns PreferencesDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public preferencesDeleteProfilePreferencesByCategoryHandler({
        category,
    }: {
        category: string,
    }): CancelablePromise<PreferencesDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/profile/preferences/{category}',
            path: {
                'category': category,
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
