import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@shared/database/database.service';

export interface AuditEventInput {
  tenantId?: string;
  actorId?: string;
  actorRole?: string;
  action: string;
  entity: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  stationId?: string;
  correlationId?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly db: DatabaseService) {}

  async write(event: AuditEventInput): Promise<void> {
    await this.db.query(
      'select audit.write($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11,$12)',
      [
        event.tenantId ?? null,
        event.actorId ?? null,
        event.actorRole ?? null,
        event.action,
        event.entity,
        event.entityId ?? null,
        event.details ?? {},
        event.ipAddress ?? null,
        event.stationId ?? null,
        event.correlationId ?? null,
        null,
        null,
      ],
      {
        tenantId: event.tenantId,
        userId: event.actorId,
        roles: event.actorRole ? [event.actorRole] : undefined,
        correlationId: event.correlationId,
      },
    );
  }
}
