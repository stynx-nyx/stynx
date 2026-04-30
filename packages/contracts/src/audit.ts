export interface AuditEventEnvelope {
  occurredAt: string;
  action: string;
  entity: string;
  entityId?: string;
  pk?: Record<string, unknown>;
  tenantId?: string;
  actorId?: string;
  actorRole?: string;
  correlationId?: string;
  requestId?: string;
  ipAddress?: string;
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface AuditSink {
  write(event: AuditEventEnvelope): Promise<void>;
}
