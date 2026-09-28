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

/** The live app-role transaction that owns a command and its audit event. */
export interface AuditTransactionExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface TransactionalAuditSink extends AuditSink {
  writeInTransaction(event: AuditEventEnvelope, executor: AuditTransactionExecutor): Promise<void>;
}
