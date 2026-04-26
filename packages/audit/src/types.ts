export interface AuditLogCursor {
  occurredAt: string;
  id: number;
}

export interface AuditLogQuery {
  tenantId?: string;
  actorId?: string;
  tableSchema?: string;
  tableName?: string;
  rowId?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}

export interface AuditLogItem {
  id: number;
  occurredAt: string;
  tableSchema: string;
  tableName: string;
  rowId?: string | null;
  operation: string;
  tenantId?: string | null;
  actorId?: string | null;
  requestId?: string | null;
  sessionId?: string | null;
  tags: Record<string, unknown>;
  payload: Record<string, unknown>;
}

export interface AuditLogPage {
  items: AuditLogItem[];
  nextCursor?: string;
}

export interface AuditEvent {
  eventId: string;
  occurredAt: string;
  tenantId?: string | null;
  actorId?: string | null;
  entity: string;
  entityId?: string | null;
  operation: string;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  previousHash: string | null;
  rowHash: string;
}

export interface ChainVerificationResult {
  valid: boolean;
  totalChecked: number;
  firstBrokenEventId?: string;
}

export interface AuditDetachPlan {
  partitionName: string;
  month: string;
  objectKey: string;
  retentionClass: 'standard_90d' | 'lgpd_5y';
  retainHotUntil: string;
}

export interface StynxAuditModuleOptions {
  bucket?: string;
  keyPrefix?: string;
  dailyDetachEnabled?: boolean;
  dailyDetachIntervalMs?: number;
}
