/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
 
import type { CreateFlowEdgeDto } from '../models/CreateFlowEdgeDto';
import type { CreateFlowGraphDto } from '../models/CreateFlowGraphDto';
import type { CreateFlowNodeDto } from '../models/CreateFlowNodeDto';
import type { CreateFlowTransitionEffectDto } from '../models/CreateFlowTransitionEffectDto';
import type { FlowGraphExportDocument } from '../models/FlowGraphExportDocument';
import type { FlowGraphImportDocument } from '../models/FlowGraphImportDocument';
import type { FlowJsonObject } from '../models/FlowJsonObject';
import type { ProblemDetails } from '../models/ProblemDetails';
import type { PublishFlowGraphDto } from '../models/PublishFlowGraphDto';
import type { UpdateFlowGraphDto } from '../models/UpdateFlowGraphDto';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class FlowGraphsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsGetFlowGraphsList({
        scopeId,
    }: {
        scopeId?: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/graphs',
            query: {
                'scopeId': scopeId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPostFlowGraphsCreate({
        requestBody,
    }: {
        requestBody: CreateFlowGraphDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/graphs',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsGetFlowGraphsByGraphIdEdgesListEdges({
        graphId,
    }: {
        graphId: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/graphs/{graphId}/edges',
            path: {
                'graphId': graphId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPostFlowGraphsByGraphIdEdgesCreateEdge({
        graphId,
        requestBody,
    }: {
        graphId: string,
        requestBody: CreateFlowEdgeDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/graphs/{graphId}/edges',
            path: {
                'graphId': graphId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsGetFlowGraphsByGraphIdNodesListNodes({
        graphId,
    }: {
        graphId: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/graphs/{graphId}/nodes',
            path: {
                'graphId': graphId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPostFlowGraphsByGraphIdNodesCreateNode({
        graphId,
        requestBody,
    }: {
        graphId: string,
        requestBody: CreateFlowNodeDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/graphs/{graphId}/nodes',
            path: {
                'graphId': graphId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsGetFlowGraphsByGraphIdTransitionEffectsListTransitionEffects({
        graphId,
    }: {
        graphId: string,
    }): CancelablePromise<Array<FlowJsonObject> | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/graphs/{graphId}/transition-effects',
            path: {
                'graphId': graphId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPostFlowGraphsByGraphIdTransitionEffectsCreateTransitionEffect({
        graphId,
        requestBody,
    }: {
        graphId: string,
        requestBody: CreateFlowTransitionEffectDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/graphs/{graphId}/transition-effects',
            path: {
                'graphId': graphId,
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsDeleteFlowGraphsByIdDelete({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'DELETE',
            url: '/flow/graphs/{id}',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsGetFlowGraphsByIdGet({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/graphs/{id}',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPatchFlowGraphsByIdUpdate({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: UpdateFlowGraphDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'PATCH',
            url: '/flow/graphs/{id}',
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
     * @returns FlowGraphExportDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsGetFlowGraphsByIdExportExport({
        id,
    }: {
        id: string,
    }): CancelablePromise<FlowGraphExportDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/flow/graphs/{id}/export',
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
     * @returns FlowJsonObject OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPostFlowGraphsByIdPublishPublish({
        id,
        requestBody,
    }: {
        id: string,
        requestBody: PublishFlowGraphDto,
    }): CancelablePromise<FlowJsonObject | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/graphs/{id}/publish',
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
     * @returns FlowGraphExportDocument OK
     * @returns ProblemDetails Unexpected error
     * @throws ApiError
     */
    public flowGraphsPostFlowGraphsImportImport({
        requestBody,
    }: {
        requestBody: FlowGraphImportDocument,
    }): CancelablePromise<FlowGraphExportDocument | ProblemDetails> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/flow/graphs/import',
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
