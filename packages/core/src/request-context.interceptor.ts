import {
  BadRequestException,
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, type Subscription } from 'rxjs';
import { generateRequestId, normalizeRequestId } from './request-id';
import type { RequestContextState } from './request-context';
import { RequestContextMutator } from './request-context';

function extractHeader(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return undefined;
}

function extractLocale(value: unknown): string | undefined {
  const header = extractHeader(value)?.trim();
  if (!header) {
    return undefined;
  }
  return header.split(',')[0]?.trim() || undefined;
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
}

interface RequestLike {
  headers: Record<string, unknown>;
  tenantId?: string;
  principal?: { id?: string };
  actor?: { id?: string };
  user?: { id?: string };
  stynxClaims?: {
    sub?: string;
    sid?: string;
    tenantId?: string;
  };
}

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContextMutator: RequestContextMutator) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestLike>();
    const response = context.switchToHttp().getResponse<ResponseLike>();
    const requestedId = extractHeader(request.headers['x-request-id']);
    const requestId = requestedId ? normalizeRequestId(requestedId) : undefined;

    if (requestedId && !requestId) {
      throw new BadRequestException('X-Request-Id must be a valid UUIDv7');
    }

    const locale = extractLocale(request.headers['accept-language']);
    const tenantId = request.tenantId ?? request.stynxClaims?.tenantId;
    const actorId = request.stynxClaims?.sub
      ?? request.principal?.id
      ?? request.actor?.id
      ?? request.user?.id;
    const sessionId = request.stynxClaims?.sid;
    const seed: RequestContextState = {
      requestId: requestId ?? generateRequestId(),
      startedAt: new Date(),
      ...(tenantId ? { tenantId } : {}),
      ...(actorId ? { actorId } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(locale ? { locale } : {}),
    };

    response.setHeader('X-Request-Id', seed.requestId);

    return new Observable<unknown>((subscriber) => {
      let subscription: Subscription | undefined;

      this.requestContextMutator.runWithRequestContext(seed, () => {
        subscription = next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error: unknown) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });

      return () => subscription?.unsubscribe();
    });
  }
}
