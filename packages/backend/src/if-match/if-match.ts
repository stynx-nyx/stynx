import {
  applyDecorators,
  Catch,
  createParamDecorator,
  HttpException,
  Injectable,
  Optional,
  UseFilters,
  UseInterceptors,
  type ArgumentsHost,
  type CallHandler,
  type ExceptionFilter,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { generateRequestId, normalizeRequestId, RequestContext } from '@stynx-nyx/core';
import { map, type Observable } from 'rxjs';

const IF_MATCH_REVISION = Symbol('STYNX_IF_MATCH_REVISION');
const STRONG_REVISION_TAG = /^"(0|[1-9][0-9]*)"$/u;

type IfMatchRequest = {
  headers: Record<string, unknown>;
  [IF_MATCH_REVISION]?: number;
};

type RevisionResponse = {
  setHeader(name: string, value: string): void;
  getHeader?(name: string): unknown;
};

/** A missing precondition. Route owners can provide a safe public message and metadata. */
export class PreconditionRequiredError extends HttpException {
  constructor(message = 'If-Match is required', readonly details?: Record<string, unknown>) {
    super(message, 428);
  }
}

/** A malformed or stale precondition. Route owners can provide safe public metadata. */
export class PreconditionFailedError extends HttpException {
  constructor(message = 'If-Match precondition failed', readonly details?: Record<string, unknown>) {
    super(message, 412);
  }
}

/** Parse exactly one strong quoted, canonical, nonnegative safe integer revision. */
export function parseIfMatchRevision(value: string | undefined): number {
  if (value === undefined) throw new PreconditionRequiredError();
  const match = STRONG_REVISION_TAG.exec(value);
  if (!match) throw new PreconditionFailedError();
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision)) throw new PreconditionFailedError();
  return revision;
}

/** Handles only STYNX If-Match errors, leaving all other exceptions to route/global filters. */
@Catch(PreconditionRequiredError, PreconditionFailedError)
@Injectable()
export class IfMatchExceptionFilter implements ExceptionFilter<PreconditionRequiredError | PreconditionFailedError> {
  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Optional() private readonly requestContext?: RequestContext,
  ) {}

  catch(exception: PreconditionRequiredError | PreconditionFailedError, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<IfMatchRequest>();
    const response = host.switchToHttp().getResponse<RevisionResponse>();
    const adapter = this.adapterHost.httpAdapter;
    const contextId = this.requestContext?.hasActiveContext() ? this.requestContext.requestId : undefined;
    const responseId = normalizeRequestId(adapter.getHeader(response, 'x-request-id'));
    const suppliedId = normalizeRequestId(request.headers['x-request-id']);
    const requestId = contextId ?? responseId ?? suppliedId ?? generateRequestId();
    adapter.setHeader(response, 'X-Request-Id', requestId);
    adapter.reply(response, {
      statusCode: exception.getStatus(),
      errorCode: exception instanceof PreconditionRequiredError
        ? 'PRECONDITION:REQUIRED:if-match'
        : 'PRECONDITION:FAILED:if-match',
      message: exception.message,
      requestId,
      ...(exception.details ? { details: exception.details } : {}),
    }, exception.getStatus());
  }
}

@Injectable()
export class IfMatchPreconditionInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<IfMatchRequest>();
    const supplied = request.headers['if-match'];
    if (supplied !== undefined && typeof supplied !== 'string') throw new PreconditionFailedError();
    request[IF_MATCH_REVISION] = parseIfMatchRevision(supplied);
    return next.handle();
  }
}

/** Install parsing and a method-scoped law-envelope filter before the handler. */
export function RequireIfMatch(): MethodDecorator {
  return applyDecorators(
    UseFilters(IfMatchExceptionFilter),
    UseInterceptors(IfMatchPreconditionInterceptor),
  ) as MethodDecorator;
}

/** The parsed revision from a route decorated with `@RequireIfMatch()`. */
export const IfMatchRevision = createParamDecorator(
  (_: unknown, context: ExecutionContext): number => {
    const revision = context.switchToHttp().getRequest<IfMatchRequest>()[IF_MATCH_REVISION];
    if (revision === undefined) throw new Error('IfMatchRevision requires RequireIfMatch');
    return revision;
  },
);

@Injectable()
export class RevisionETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<RevisionResponse>();
    return next.handle().pipe(map((body: unknown) => {
      const revision = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as { revision?: unknown }).revision : undefined;
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
        throw new Error('RevisionETag requires a safe nonnegative integer revision in the response body');
      }
      response.setHeader('ETag', `"${revision}"`);
      return body;
    }));
  }
}

/** Set a strong revision ETag from a successful `{revision: number}` response body. */
export function RevisionETag(): MethodDecorator {
  return UseInterceptors(RevisionETagInterceptor) as MethodDecorator;
}
