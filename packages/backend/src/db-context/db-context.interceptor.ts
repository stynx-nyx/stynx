import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, Optional } from '@nestjs/common';
import type { DbContextApplier, DbSessionContext } from '@stynx/contracts';
import { finalize, from, mergeMap, Observable } from 'rxjs';
import { getPrincipalFromRequest, type RequestLike } from '../common/request-context';
import {
  STYNX_DB_CLIENT_RESOLVER,
  STYNX_DB_CONTEXT_APPLIER,
  STYNX_REQUEST_DB_CLIENT_LIFECYCLE,
} from './constants';
import type { RequestDbClientLifecycle } from './request-db-client-lifecycle';

export type DbClientResolver = (request: RequestLike) => unknown;
interface PreparedRequestState {
  clientToRelease?: unknown;
  tenantId?: string;
}

@Injectable()
export class DbContextInterceptor implements NestInterceptor {
  constructor(
    @Inject(STYNX_DB_CONTEXT_APPLIER)
    private readonly dbContextApplier: DbContextApplier,
    @Optional() @Inject(STYNX_DB_CLIENT_RESOLVER)
    private readonly dbClientResolver?: DbClientResolver,
    @Optional() @Inject(STYNX_REQUEST_DB_CLIENT_LIFECYCLE)
    private readonly dbClientLifecycle?: RequestDbClientLifecycle,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    let preparedState: PreparedRequestState | undefined;

    return from(this.prepareRequest(request)).pipe(
      mergeMap((state) => {
        preparedState = state;
        return next.handle();
      }),
      finalize(() => {
        if (!preparedState) return;
        void this.releaseRequestClient(request, preparedState);
      }),
    );
  }

  private async prepareRequest(request: RequestLike): Promise<PreparedRequestState> {
    const state: PreparedRequestState = {};
    const principal = getPrincipalFromRequest(request);
    const client = await this.resolveClient(request, state);

    if (principal && client) {
      const sessionContext: DbSessionContext = {
        userId: principal.id,
        roles: principal.roles,
        permissions: principal.permissions,
        ...(request.tenantId ? { tenantId: request.tenantId } : {}),
        ...(request.correlationId ? { correlationId: request.correlationId } : {}),
        ...(request.requestId ? { requestId: request.requestId } : {}),
      };
      await this.dbContextApplier.apply(client, sessionContext);
    }

    return state;
  }

  private async resolveClient(
    request: RequestLike,
    state: PreparedRequestState,
  ): Promise<unknown> {
    const resolved =
      this.dbClientResolver?.(request) ??
      request.pgClient ??
      request.dbClient;

    if (resolved) {
      return resolved;
    }

    if (!request.tenantId || !this.dbClientLifecycle) {
      return undefined;
    }

    const acquired = await this.dbClientLifecycle.acquire({
      request,
      tenantId: request.tenantId,
    });
    if (!acquired) {
      return undefined;
    }

    request.pgClient ??= acquired;
    request.dbClient ??= acquired;
    state.clientToRelease = acquired;
    state.tenantId = request.tenantId;

    return acquired;
  }

  private async releaseRequestClient(
    request: RequestLike,
    state: PreparedRequestState,
  ): Promise<void> {
    if (!state.clientToRelease || !state.tenantId || !this.dbClientLifecycle) {
      return;
    }
    try {
      await this.dbClientLifecycle.release({
        request,
        tenantId: state.tenantId,
        client: state.clientToRelease,
      });
    } catch {
      // release errors should not fail request completion path
    }
  }
}
