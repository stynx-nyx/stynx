import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';

@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const header = 'x-correlation-id';
    const correlationId = (request.headers[header] as string | undefined) ?? randomUUID();
    request.correlationId = correlationId;
    response.setHeader(header, correlationId);
    return next.handle();
  }
}
