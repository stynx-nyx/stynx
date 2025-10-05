import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AUDIT_METADATA_KEY, AuditMetadata } from './decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata>(AUDIT_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!metadata) {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest();
    return next.handle().pipe(
      tap(async () => {
        await this.auditService.write({
          tenantId: request.tenantId,
          actorId: request.user?.id,
          actorRole: request.user?.roles?.[0],
          action: metadata.action,
          entity: metadata.entity ?? context.getClass().name,
          entityId: metadata.entityIdSelector ? metadata.entityIdSelector(request) : undefined,
          details: metadata.detailsSelector ? metadata.detailsSelector(request) : undefined,
          ipAddress: request.ip,
          stationId: request.headers['x-station-id'],
          correlationId: request.correlationId,
        });
      }),
    );
  }
}
