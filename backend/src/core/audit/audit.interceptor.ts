import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { tap } from 'rxjs';
import { AuditService } from './audit.service';
import { AUDIT_METADATA_KEY, AuditMetadata, AuditRequest } from './decorators/audit.decorator';

function headerValueToString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.at(0) ?? undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

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
    const request = context.switchToHttp().getRequest<AuditRequest>();
    const rawStationHeader = request.headers['x-station-id'];
    const stationId = headerValueToString(rawStationHeader);
    return next.handle().pipe(
      tap(() =>
        this.auditService.write({
          tenantId: request.tenantId,
          actorId: request.user?.id,
          actorRole: request.user?.roles?.[0],
          action: metadata.action,
          entity: metadata.entity ?? context.getClass().name,
          entityId: metadata.entityIdSelector ? metadata.entityIdSelector(request) : undefined,
          details: metadata.detailsSelector ? metadata.detailsSelector(request) : undefined,
          ipAddress: request.ip,
          stationId,
          correlationId: request.correlationId,
        }),
      ),
    );
  }
}
