export interface StynxAuditPackageOptions {
  readonly permission?: 'platform:audit:read:*' | string;
}

export type AuditIntegrityTone = 'valid' | 'broken' | 'unchecked';

export interface AuditFilter {
  readonly actorId?: string;
  readonly action?: string;
  readonly entityKind?: string;
  readonly entityId?: string;
  readonly tenantId?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly limit?: number;
}

export interface AuditEntityHistoryFilter {
  readonly tenantId?: string;
  readonly limit?: number;
}

export interface AuditActorSummary {
  readonly id?: string | null;
  readonly displayName?: string | null;
  readonly role?: string | null;
}

export interface AuditEntitySummary {
  readonly kind: string;
  readonly id?: string | null;
  readonly label?: string | null;
}

export interface AuditEventSummary {
  readonly eventId: string;
  readonly occurredAt: string;
  readonly tenantId?: string | null;
  readonly actor: AuditActorSummary;
  readonly action: string;
  readonly entity: AuditEntitySummary;
  readonly requestId?: string | null;
  readonly integrity: AuditIntegrityTone;
}

export interface AuditEventDetail extends AuditEventSummary {
  readonly sessionId?: string | null;
  readonly ipAddress?: string | null;
  readonly metadata: Record<string, unknown>;
  readonly before?: Record<string, unknown> | null;
  readonly after?: Record<string, unknown> | null;
  readonly previousHash?: string | null;
  readonly rowHash?: string | null;
}

export interface AuditPage<T = AuditEventSummary> {
  readonly items: T[];
  readonly nextCursor?: string;
}

export interface AuditIntegrityReport {
  readonly eventId: string;
  readonly tenantId?: string | null;
  readonly valid: boolean;
  readonly checkedAt: string;
  readonly checkedThroughEventId: string;
  readonly previousEventId?: string | null;
  readonly nextEventId?: string | null;
  readonly previousHash?: string | null;
  readonly rowHash?: string | null;
  readonly totalChecked: number;
  readonly firstBrokenEventId?: string;
}
