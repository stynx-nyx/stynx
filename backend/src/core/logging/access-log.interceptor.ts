import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class AccessLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AccessLog');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const startedAt = Date.now();
    const { method } = req;
    const path = req.originalUrl ?? req.url;
    const ip: string | undefined = req.ip;
    const tenant: string | undefined = req.tenantId;
    const user: string | undefined = req.user?.id;
    const corr: string | undefined = req.correlationId;

    return next.handle().pipe(
      tap({
        next: () => {
          const status = context.switchToHttp().getResponse()?.statusCode ?? 200;
          this.logger.log(
            JSON.stringify({
              ts: new Date().toISOString(),
              method,
              path,
              status,
              ms: Date.now() - startedAt,
              tenant,
              user,
              ip,
              corr,
            }),
          );
        },
        error: (err) => {
          const status = err?.status ?? context.switchToHttp().getResponse()?.statusCode ?? 500;
          this.logger.warn(
            JSON.stringify({
              ts: new Date().toISOString(),
              method,
              path,
              status,
              ms: Date.now() - startedAt,
              tenant,
              user,
              ip,
              corr,
              error: err?.message,
            }),
          );
        },
      }),
    );
  }
}
