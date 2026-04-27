import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Optional,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuditEventEnvelope, AuditSink } from '@stynx/contracts';
import { from, mergeMap, Observable } from 'rxjs';
import { getPrincipalFromRequest, type RequestLike } from '../common/request-context';
import {
  STYNX_AUDIT_METADATA,
  STYNX_AUDIT_METADATA_REDACTION_POLICY,
  STYNX_AUDIT_SINK,
} from './constants';
import type { AuditMetadata } from './decorators';
import type { AuditMetadataRedactionPolicy } from './redaction-policy';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    @Inject(STYNX_AUDIT_SINK) private readonly auditSink: AuditSink,
    @Optional()
    @Inject(STYNX_AUDIT_METADATA_REDACTION_POLICY)
    private readonly metadataRedactionPolicy?: AuditMetadataRedactionPolicy,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(STYNX_AUDIT_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RequestLike>();

    return next.handle().pipe(
      mergeMap((payload) =>
        from(
          this.writeEvent(metadata, request, context, payload).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Audit sink write failed: ${message}`);
          }),
        ).pipe(mergeMap(() => [payload])),
      ),
    );
  }

  private async writeEvent(
    metadata: AuditMetadata,
    request: RequestLike,
    context: ExecutionContext,
    payload: unknown,
  ): Promise<void> {
    const principal = getPrincipalFromRequest(request);
    const entityId = metadata.entityIdSelector
      ? metadata.entityIdSelector(request)
      : this.inferEntityId(payload);
    const rawMetadata = metadata.metadataSelector ? metadata.metadataSelector(request) : undefined;
    const redactedMetadata = this.metadataRedactionPolicy
      ? this.metadataRedactionPolicy.redact(rawMetadata, {
          action: metadata.action,
          entity: metadata.entity ?? context.getClass().name,
          request,
          ...(principal ? { principal } : {}),
        })
      : rawMetadata;

    const envelope: AuditEventEnvelope = {
      occurredAt: new Date().toISOString(),
      action: metadata.action,
      entity: metadata.entity ?? context.getClass().name,
      ...(entityId ? { entityId } : {}),
      ...(request.tenantId ? { tenantId: request.tenantId } : {}),
      ...(principal?.id ? { actorId: principal.id } : {}),
      ...(principal?.roles?.[0] ? { actorRole: principal.roles[0] } : {}),
      ...(request.correlationId ? { correlationId: request.correlationId } : {}),
      ...(request.requestId ? { requestId: request.requestId } : {}),
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(redactedMetadata ? { metadata: redactedMetadata } : {}),
    };

    await this.auditSink.write(envelope);
  }

  private inferEntityId(payload: unknown): string | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const value = (payload as { id?: unknown }).id;
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }
}
