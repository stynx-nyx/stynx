import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { RequestContextMutator } from '@stynx/core';
import { Observable } from 'rxjs';
import type { RequestLike } from './types';

@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContextMutator: RequestContextMutator) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    if (request.stynxClaims) {
      this.requestContextMutator.patch({
        tenantId: request.stynxClaims.tenantId,
        actorId: request.stynxClaims.sub,
        sessionId: request.stynxClaims.sid,
      });
    }
    return next.handle();
  }
}
