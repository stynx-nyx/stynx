import { bindQueryContext, executeConfiguredQuery, executeTypedQuery, QueryRowValidationError } from '@stynx-nyx/data';
import { writeCommandAudit, writeLegacyAudit } from './audit.repository.js';
import type { AuditEventEnvelope, AuditSink, AuditTransactionExecutor, TransactionalAuditSink } from '@stynx-nyx/contracts';

export interface SqlExecutor {
  query(sql: string, params?: unknown[]): Promise<unknown>;
}

export interface AuditSqlSinkOptions {
  mode: 'audit_write_function' | 'audit_event_table';
  schema?: string;
  table?: string;
}

export interface AuditSqlListQuery {
  limit?: number;
  offset?: number;
  tenantId?: string;
  entity?: string;
  operation?: string;
  actorId?: string;
  requestId?: string;
  from?: string;
  to?: string;
}

export interface AuditSqlListItem {
  occurredAt: string | number;
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  operation: string;
  entity: string;
  entityId?: string | null;
  pk?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  requestId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  oldData?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  newData?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  previousHash?: string | null;
  rowHash?: string | null;
}

export interface AuditSqlListResult {
  items: AuditSqlListItem[];
  total: number;
}

export interface AuditSqlReaderOptions {
  mode: 'audit_log' | 'stynx_events' | 'porm_logged_actions';
  schema?: string;
  table?: string;
}

export class AuditSqlSink implements AuditSink, TransactionalAuditSink {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly options: AuditSqlSinkOptions,
  ) {}

  async write(event: AuditEventEnvelope): Promise<void> {
    if (this.options.mode === 'audit_write_function') {
      await this.writeUsingFunction(event);
      return;
    }

    await this.writeUsingTable(event);
  }

  async writeInTransaction(event: AuditEventEnvelope, executor: AuditTransactionExecutor): Promise<void> {
    if (this.options.mode !== 'audit_write_function') {
      throw new Error('Transactional commands require audit_write_function mode');
    }
    const pk = event.pk ?? (event.entityId ? { id: event.entityId } : undefined);
    await executeTypedQuery(bindQueryContext(executor), writeCommandAudit,
      [
        event.action,
        event.entity,
        event.entityId ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.ipAddress ?? null,
        null,
        event.requestId ?? event.correlationId ?? null,
        event.oldData ? JSON.stringify(event.oldData) : null,
        event.newData ? JSON.stringify(event.newData) : null,
        pk ? JSON.stringify(pk) : null,
      ],
    );
  }

  private async writeUsingFunction(event: AuditEventEnvelope): Promise<void> {
    const pk = event.pk ?? (event.entityId ? { id: event.entityId } : undefined);
    await executeTypedQuery(bindQueryContext(this.executor), writeLegacyAudit,
      [
        event.tenantId ?? null,
        event.actorId ?? null,
        event.actorRole ?? null,
        event.action,
        event.entity,
        event.entityId ?? null,
        JSON.stringify(event.metadata ?? {}),
        event.ipAddress ?? null,
        null,
        event.requestId ?? event.correlationId ?? null,
        event.oldData ? JSON.stringify(event.oldData) : null,
        event.newData ? JSON.stringify(event.newData) : null,
        pk ? JSON.stringify(pk) : null,
      ],
    );
  }

  private async writeUsingTable(event: AuditEventEnvelope): Promise<void> {
    const schema = this.options.schema ?? 'public';
    const table = this.options.table ?? 'audit_event';
    await executeConfiguredQuery(this.executor, 'audit.write-table', { schema, table },
      [
        event.occurredAt,
        event.actorId ?? null,
        event.action,
        event.entity,
        event.entityId ?? null,
        event.requestId ?? null,
        event.ipAddress ?? null,
        JSON.stringify({
          tenantId: event.tenantId,
          actorRole: event.actorRole,
          correlationId: event.correlationId,
          pk: event.pk,
          oldData: event.oldData,
          newData: event.newData,
          ...event.metadata,
        }),
      ],
    );
  }
}

type AuditOpaqueValue = Record<string, unknown> | unknown[] | string | number | boolean;

function isAuditOpaqueValue(value: unknown): value is AuditOpaqueValue {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ||
    (typeof value === 'object' && value !== null);
}

function readAuditPayloadField(
  payload: AuditOpaqueValue | null | undefined,
  key: 'old' | 'new',
  rowIndex: number,
  mask: number,
): AuditOpaqueValue | null {
  if (payload === null || payload === undefined) return null;
  const target: unknown = Object(payload);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function') {
    const value: unknown = Reflect.get(target, key, payload);
    if (value === null || value === undefined) return null;
    if (isAuditOpaqueValue(value)) return value;
  }
  throw new QueryRowValidationError(`configured.audit.read-log.mask.${mask}`, rowIndex,
    [{ path: ['payload', key], code: 'invalid_type' }]);
}

function toIso(value: string | Date | number): string | number {
  return value instanceof Date ? value.toISOString() : value;
}

function sanitizeLimit(limit: number | undefined, fallback: number): number {
  if (!Number.isFinite(limit) || !limit || limit <= 0) {
    return fallback;
  }
  return Math.min(Math.trunc(limit), 500);
}

function sanitizeOffset(offset: number | undefined): number {
  if (!Number.isFinite(offset) || !offset || offset < 0) {
    return 0;
  }
  return Math.trunc(offset);
}

export class AuditSqlReader {
  constructor(
    private readonly executor: SqlExecutor,
    private readonly options: AuditSqlReaderOptions,
  ) {}

  async list(query: AuditSqlListQuery = {}): Promise<AuditSqlListResult> {
    if (this.options.mode === 'porm_logged_actions') {
      return this.listPormLoggedActions(query);
    }
    if (this.options.mode === 'stynx_events') {
      return this.listStynxEvents(query);
    }
    return this.listAuditLog(query);
  }

  private async listAuditLog(query: AuditSqlListQuery): Promise<AuditSqlListResult> {
    const schema = this.options.schema ?? 'audit';
    const table = this.options.table ?? 'log';
    const limit = sanitizeLimit(query.limit, 100);
    const offset = sanitizeOffset(query.offset);

// BEGIN GENERATED audit-remaining512 log-dispatch
    let mask = 0;
    let tenantId: string | undefined;
    if (query.tenantId) {
      mask |= 1;
      tenantId = query.tenantId;
    }
    let entity: string | undefined;
    if (query.entity) {
      mask |= 2;
      entity = query.entity;
    }
    let operation: string | undefined;
    if (query.operation) {
      mask |= 4;
      operation = query.operation;
    }
    let actorId: string | undefined;
    if (query.actorId) {
      mask |= 8;
      actorId = query.actorId;
    }
    let requestId: string | undefined;
    if (query.requestId) {
      mask |= 16;
      requestId = query.requestId;
    }
    let from: string | undefined;
    if (query.from) {
      mask |= 32;
      from = query.from;
    }
    let to: string | undefined;
    if (query.to) {
      mask |= 64;
      to = query.to;
    }
    const rows = await (async () => {
      switch (mask) {
        case 0: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.0', { schema, table }, [limit, offset])).rows;
        case 1: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.1', { schema, table }, [tenantId, limit, offset])).rows;
        case 2: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.2', { schema, table }, [entity, limit, offset])).rows;
        case 3: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.3', { schema, table }, [tenantId, entity, limit, offset])).rows;
        case 4: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.4', { schema, table }, [operation, limit, offset])).rows;
        case 5: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.5', { schema, table }, [tenantId, operation, limit, offset])).rows;
        case 6: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.6', { schema, table }, [entity, operation, limit, offset])).rows;
        case 7: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.7', { schema, table }, [tenantId, entity, operation, limit, offset])).rows;
        case 8: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.8', { schema, table }, [actorId, limit, offset])).rows;
        case 9: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.9', { schema, table }, [tenantId, actorId, limit, offset])).rows;
        case 10: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.10', { schema, table }, [entity, actorId, limit, offset])).rows;
        case 11: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.11', { schema, table }, [tenantId, entity, actorId, limit, offset])).rows;
        case 12: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.12', { schema, table }, [operation, actorId, limit, offset])).rows;
        case 13: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.13', { schema, table }, [tenantId, operation, actorId, limit, offset])).rows;
        case 14: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.14', { schema, table }, [entity, operation, actorId, limit, offset])).rows;
        case 15: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.15', { schema, table }, [tenantId, entity, operation, actorId, limit, offset])).rows;
        case 16: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.16', { schema, table }, [requestId, limit, offset])).rows;
        case 17: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.17', { schema, table }, [tenantId, requestId, limit, offset])).rows;
        case 18: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.18', { schema, table }, [entity, requestId, limit, offset])).rows;
        case 19: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.19', { schema, table }, [tenantId, entity, requestId, limit, offset])).rows;
        case 20: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.20', { schema, table }, [operation, requestId, limit, offset])).rows;
        case 21: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.21', { schema, table }, [tenantId, operation, requestId, limit, offset])).rows;
        case 22: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.22', { schema, table }, [entity, operation, requestId, limit, offset])).rows;
        case 23: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.23', { schema, table }, [tenantId, entity, operation, requestId, limit, offset])).rows;
        case 24: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.24', { schema, table }, [actorId, requestId, limit, offset])).rows;
        case 25: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.25', { schema, table }, [tenantId, actorId, requestId, limit, offset])).rows;
        case 26: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.26', { schema, table }, [entity, actorId, requestId, limit, offset])).rows;
        case 27: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.27', { schema, table }, [tenantId, entity, actorId, requestId, limit, offset])).rows;
        case 28: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.28', { schema, table }, [operation, actorId, requestId, limit, offset])).rows;
        case 29: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.29', { schema, table }, [tenantId, operation, actorId, requestId, limit, offset])).rows;
        case 30: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.30', { schema, table }, [entity, operation, actorId, requestId, limit, offset])).rows;
        case 31: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.31', { schema, table }, [tenantId, entity, operation, actorId, requestId, limit, offset])).rows;
        case 32: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.32', { schema, table }, [from, limit, offset])).rows;
        case 33: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.33', { schema, table }, [tenantId, from, limit, offset])).rows;
        case 34: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.34', { schema, table }, [entity, from, limit, offset])).rows;
        case 35: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.35', { schema, table }, [tenantId, entity, from, limit, offset])).rows;
        case 36: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.36', { schema, table }, [operation, from, limit, offset])).rows;
        case 37: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.37', { schema, table }, [tenantId, operation, from, limit, offset])).rows;
        case 38: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.38', { schema, table }, [entity, operation, from, limit, offset])).rows;
        case 39: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.39', { schema, table }, [tenantId, entity, operation, from, limit, offset])).rows;
        case 40: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.40', { schema, table }, [actorId, from, limit, offset])).rows;
        case 41: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.41', { schema, table }, [tenantId, actorId, from, limit, offset])).rows;
        case 42: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.42', { schema, table }, [entity, actorId, from, limit, offset])).rows;
        case 43: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.43', { schema, table }, [tenantId, entity, actorId, from, limit, offset])).rows;
        case 44: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.44', { schema, table }, [operation, actorId, from, limit, offset])).rows;
        case 45: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.45', { schema, table }, [tenantId, operation, actorId, from, limit, offset])).rows;
        case 46: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.46', { schema, table }, [entity, operation, actorId, from, limit, offset])).rows;
        case 47: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.47', { schema, table }, [tenantId, entity, operation, actorId, from, limit, offset])).rows;
        case 48: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.48', { schema, table }, [requestId, from, limit, offset])).rows;
        case 49: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.49', { schema, table }, [tenantId, requestId, from, limit, offset])).rows;
        case 50: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.50', { schema, table }, [entity, requestId, from, limit, offset])).rows;
        case 51: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.51', { schema, table }, [tenantId, entity, requestId, from, limit, offset])).rows;
        case 52: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.52', { schema, table }, [operation, requestId, from, limit, offset])).rows;
        case 53: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.53', { schema, table }, [tenantId, operation, requestId, from, limit, offset])).rows;
        case 54: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.54', { schema, table }, [entity, operation, requestId, from, limit, offset])).rows;
        case 55: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.55', { schema, table }, [tenantId, entity, operation, requestId, from, limit, offset])).rows;
        case 56: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.56', { schema, table }, [actorId, requestId, from, limit, offset])).rows;
        case 57: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.57', { schema, table }, [tenantId, actorId, requestId, from, limit, offset])).rows;
        case 58: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.58', { schema, table }, [entity, actorId, requestId, from, limit, offset])).rows;
        case 59: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.59', { schema, table }, [tenantId, entity, actorId, requestId, from, limit, offset])).rows;
        case 60: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.60', { schema, table }, [operation, actorId, requestId, from, limit, offset])).rows;
        case 61: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.61', { schema, table }, [tenantId, operation, actorId, requestId, from, limit, offset])).rows;
        case 62: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.62', { schema, table }, [entity, operation, actorId, requestId, from, limit, offset])).rows;
        case 63: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.63', { schema, table }, [tenantId, entity, operation, actorId, requestId, from, limit, offset])).rows;
        case 64: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.64', { schema, table }, [to, limit, offset])).rows;
        case 65: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.65', { schema, table }, [tenantId, to, limit, offset])).rows;
        case 66: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.66', { schema, table }, [entity, to, limit, offset])).rows;
        case 67: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.67', { schema, table }, [tenantId, entity, to, limit, offset])).rows;
        case 68: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.68', { schema, table }, [operation, to, limit, offset])).rows;
        case 69: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.69', { schema, table }, [tenantId, operation, to, limit, offset])).rows;
        case 70: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.70', { schema, table }, [entity, operation, to, limit, offset])).rows;
        case 71: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.71', { schema, table }, [tenantId, entity, operation, to, limit, offset])).rows;
        case 72: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.72', { schema, table }, [actorId, to, limit, offset])).rows;
        case 73: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.73', { schema, table }, [tenantId, actorId, to, limit, offset])).rows;
        case 74: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.74', { schema, table }, [entity, actorId, to, limit, offset])).rows;
        case 75: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.75', { schema, table }, [tenantId, entity, actorId, to, limit, offset])).rows;
        case 76: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.76', { schema, table }, [operation, actorId, to, limit, offset])).rows;
        case 77: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.77', { schema, table }, [tenantId, operation, actorId, to, limit, offset])).rows;
        case 78: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.78', { schema, table }, [entity, operation, actorId, to, limit, offset])).rows;
        case 79: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.79', { schema, table }, [tenantId, entity, operation, actorId, to, limit, offset])).rows;
        case 80: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.80', { schema, table }, [requestId, to, limit, offset])).rows;
        case 81: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.81', { schema, table }, [tenantId, requestId, to, limit, offset])).rows;
        case 82: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.82', { schema, table }, [entity, requestId, to, limit, offset])).rows;
        case 83: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.83', { schema, table }, [tenantId, entity, requestId, to, limit, offset])).rows;
        case 84: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.84', { schema, table }, [operation, requestId, to, limit, offset])).rows;
        case 85: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.85', { schema, table }, [tenantId, operation, requestId, to, limit, offset])).rows;
        case 86: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.86', { schema, table }, [entity, operation, requestId, to, limit, offset])).rows;
        case 87: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.87', { schema, table }, [tenantId, entity, operation, requestId, to, limit, offset])).rows;
        case 88: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.88', { schema, table }, [actorId, requestId, to, limit, offset])).rows;
        case 89: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.89', { schema, table }, [tenantId, actorId, requestId, to, limit, offset])).rows;
        case 90: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.90', { schema, table }, [entity, actorId, requestId, to, limit, offset])).rows;
        case 91: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.91', { schema, table }, [tenantId, entity, actorId, requestId, to, limit, offset])).rows;
        case 92: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.92', { schema, table }, [operation, actorId, requestId, to, limit, offset])).rows;
        case 93: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.93', { schema, table }, [tenantId, operation, actorId, requestId, to, limit, offset])).rows;
        case 94: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.94', { schema, table }, [entity, operation, actorId, requestId, to, limit, offset])).rows;
        case 95: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.95', { schema, table }, [tenantId, entity, operation, actorId, requestId, to, limit, offset])).rows;
        case 96: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.96', { schema, table }, [from, to, limit, offset])).rows;
        case 97: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.97', { schema, table }, [tenantId, from, to, limit, offset])).rows;
        case 98: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.98', { schema, table }, [entity, from, to, limit, offset])).rows;
        case 99: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.99', { schema, table }, [tenantId, entity, from, to, limit, offset])).rows;
        case 100: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.100', { schema, table }, [operation, from, to, limit, offset])).rows;
        case 101: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.101', { schema, table }, [tenantId, operation, from, to, limit, offset])).rows;
        case 102: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.102', { schema, table }, [entity, operation, from, to, limit, offset])).rows;
        case 103: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.103', { schema, table }, [tenantId, entity, operation, from, to, limit, offset])).rows;
        case 104: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.104', { schema, table }, [actorId, from, to, limit, offset])).rows;
        case 105: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.105', { schema, table }, [tenantId, actorId, from, to, limit, offset])).rows;
        case 106: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.106', { schema, table }, [entity, actorId, from, to, limit, offset])).rows;
        case 107: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.107', { schema, table }, [tenantId, entity, actorId, from, to, limit, offset])).rows;
        case 108: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.108', { schema, table }, [operation, actorId, from, to, limit, offset])).rows;
        case 109: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.109', { schema, table }, [tenantId, operation, actorId, from, to, limit, offset])).rows;
        case 110: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.110', { schema, table }, [entity, operation, actorId, from, to, limit, offset])).rows;
        case 111: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.111', { schema, table }, [tenantId, entity, operation, actorId, from, to, limit, offset])).rows;
        case 112: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.112', { schema, table }, [requestId, from, to, limit, offset])).rows;
        case 113: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.113', { schema, table }, [tenantId, requestId, from, to, limit, offset])).rows;
        case 114: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.114', { schema, table }, [entity, requestId, from, to, limit, offset])).rows;
        case 115: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.115', { schema, table }, [tenantId, entity, requestId, from, to, limit, offset])).rows;
        case 116: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.116', { schema, table }, [operation, requestId, from, to, limit, offset])).rows;
        case 117: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.117', { schema, table }, [tenantId, operation, requestId, from, to, limit, offset])).rows;
        case 118: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.118', { schema, table }, [entity, operation, requestId, from, to, limit, offset])).rows;
        case 119: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.119', { schema, table }, [tenantId, entity, operation, requestId, from, to, limit, offset])).rows;
        case 120: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.120', { schema, table }, [actorId, requestId, from, to, limit, offset])).rows;
        case 121: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.121', { schema, table }, [tenantId, actorId, requestId, from, to, limit, offset])).rows;
        case 122: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.122', { schema, table }, [entity, actorId, requestId, from, to, limit, offset])).rows;
        case 123: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.123', { schema, table }, [tenantId, entity, actorId, requestId, from, to, limit, offset])).rows;
        case 124: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.124', { schema, table }, [operation, actorId, requestId, from, to, limit, offset])).rows;
        case 125: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.125', { schema, table }, [tenantId, operation, actorId, requestId, from, to, limit, offset])).rows;
        case 126: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.126', { schema, table }, [entity, operation, actorId, requestId, from, to, limit, offset])).rows;
        case 127: return (await executeConfiguredQuery(this.executor, 'audit.read-log.mask.127', { schema, table }, [tenantId, entity, operation, actorId, requestId, from, to, limit, offset])).rows;
        default: throw new TypeError('Unknown log audit reader filter mask');
      }
    })();
// END GENERATED audit-remaining512 log-dispatch
    return {
      items: rows.map((row, rowIndex) => ({
        occurredAt: toIso(row.occurred_at),
        tenantId: row.tenant_id ?? null,
        actorId: row.actor_id ?? null,
        operation: row.operation ?? 'UNKNOWN',
        entity: `${row.table_schema ?? 'unknown'}.${row.table_name ?? 'unknown'}`,
        entityId: row.row_id ?? null,
        requestId: row.request_id ?? null,
        metadata: {
          tags: row.tags ?? {},
          payload: row.payload ?? {},
        },
        oldData: readAuditPayloadField(row.payload, 'old', rowIndex, mask),
        newData: readAuditPayloadField(row.payload, 'new', rowIndex, mask),
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  private async listStynxEvents(query: AuditSqlListQuery): Promise<AuditSqlListResult> {
    const schema = this.options.schema ?? 'audit';
    const table = this.options.table ?? 'events';
    const limit = sanitizeLimit(query.limit, 100);
    const offset = sanitizeOffset(query.offset);

// BEGIN GENERATED audit-remaining512 events-dispatch
    let mask = 0;
    let tenantId: string | undefined;
    if (query.tenantId) {
      mask |= 1;
      tenantId = query.tenantId;
    }
    let entity: string | undefined;
    if (query.entity) {
      mask |= 2;
      entity = query.entity;
    }
    let operation: string | undefined;
    if (query.operation) {
      mask |= 4;
      operation = query.operation;
    }
    let actorId: string | undefined;
    if (query.actorId) {
      mask |= 8;
      actorId = query.actorId;
    }
    let requestId: string | undefined;
    if (query.requestId) {
      mask |= 16;
      requestId = query.requestId;
    }
    let from: string | undefined;
    if (query.from) {
      mask |= 32;
      from = query.from;
    }
    let to: string | undefined;
    if (query.to) {
      mask |= 64;
      to = query.to;
    }
    const rows = await (async () => {
      switch (mask) {
        case 0: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.0', { schema, table }, [limit, offset])).rows;
        case 1: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.1', { schema, table }, [tenantId, limit, offset])).rows;
        case 2: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.2', { schema, table }, [entity, limit, offset])).rows;
        case 3: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.3', { schema, table }, [tenantId, entity, limit, offset])).rows;
        case 4: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.4', { schema, table }, [operation, limit, offset])).rows;
        case 5: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.5', { schema, table }, [tenantId, operation, limit, offset])).rows;
        case 6: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.6', { schema, table }, [entity, operation, limit, offset])).rows;
        case 7: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.7', { schema, table }, [tenantId, entity, operation, limit, offset])).rows;
        case 8: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.8', { schema, table }, [actorId, limit, offset])).rows;
        case 9: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.9', { schema, table }, [tenantId, actorId, limit, offset])).rows;
        case 10: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.10', { schema, table }, [entity, actorId, limit, offset])).rows;
        case 11: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.11', { schema, table }, [tenantId, entity, actorId, limit, offset])).rows;
        case 12: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.12', { schema, table }, [operation, actorId, limit, offset])).rows;
        case 13: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.13', { schema, table }, [tenantId, operation, actorId, limit, offset])).rows;
        case 14: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.14', { schema, table }, [entity, operation, actorId, limit, offset])).rows;
        case 15: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.15', { schema, table }, [tenantId, entity, operation, actorId, limit, offset])).rows;
        case 16: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.16', { schema, table }, [requestId, limit, offset])).rows;
        case 17: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.17', { schema, table }, [tenantId, requestId, limit, offset])).rows;
        case 18: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.18', { schema, table }, [entity, requestId, limit, offset])).rows;
        case 19: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.19', { schema, table }, [tenantId, entity, requestId, limit, offset])).rows;
        case 20: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.20', { schema, table }, [operation, requestId, limit, offset])).rows;
        case 21: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.21', { schema, table }, [tenantId, operation, requestId, limit, offset])).rows;
        case 22: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.22', { schema, table }, [entity, operation, requestId, limit, offset])).rows;
        case 23: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.23', { schema, table }, [tenantId, entity, operation, requestId, limit, offset])).rows;
        case 24: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.24', { schema, table }, [actorId, requestId, limit, offset])).rows;
        case 25: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.25', { schema, table }, [tenantId, actorId, requestId, limit, offset])).rows;
        case 26: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.26', { schema, table }, [entity, actorId, requestId, limit, offset])).rows;
        case 27: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.27', { schema, table }, [tenantId, entity, actorId, requestId, limit, offset])).rows;
        case 28: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.28', { schema, table }, [operation, actorId, requestId, limit, offset])).rows;
        case 29: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.29', { schema, table }, [tenantId, operation, actorId, requestId, limit, offset])).rows;
        case 30: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.30', { schema, table }, [entity, operation, actorId, requestId, limit, offset])).rows;
        case 31: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.31', { schema, table }, [tenantId, entity, operation, actorId, requestId, limit, offset])).rows;
        case 32: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.32', { schema, table }, [from, limit, offset])).rows;
        case 33: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.33', { schema, table }, [tenantId, from, limit, offset])).rows;
        case 34: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.34', { schema, table }, [entity, from, limit, offset])).rows;
        case 35: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.35', { schema, table }, [tenantId, entity, from, limit, offset])).rows;
        case 36: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.36', { schema, table }, [operation, from, limit, offset])).rows;
        case 37: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.37', { schema, table }, [tenantId, operation, from, limit, offset])).rows;
        case 38: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.38', { schema, table }, [entity, operation, from, limit, offset])).rows;
        case 39: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.39', { schema, table }, [tenantId, entity, operation, from, limit, offset])).rows;
        case 40: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.40', { schema, table }, [actorId, from, limit, offset])).rows;
        case 41: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.41', { schema, table }, [tenantId, actorId, from, limit, offset])).rows;
        case 42: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.42', { schema, table }, [entity, actorId, from, limit, offset])).rows;
        case 43: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.43', { schema, table }, [tenantId, entity, actorId, from, limit, offset])).rows;
        case 44: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.44', { schema, table }, [operation, actorId, from, limit, offset])).rows;
        case 45: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.45', { schema, table }, [tenantId, operation, actorId, from, limit, offset])).rows;
        case 46: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.46', { schema, table }, [entity, operation, actorId, from, limit, offset])).rows;
        case 47: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.47', { schema, table }, [tenantId, entity, operation, actorId, from, limit, offset])).rows;
        case 48: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.48', { schema, table }, [requestId, from, limit, offset])).rows;
        case 49: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.49', { schema, table }, [tenantId, requestId, from, limit, offset])).rows;
        case 50: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.50', { schema, table }, [entity, requestId, from, limit, offset])).rows;
        case 51: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.51', { schema, table }, [tenantId, entity, requestId, from, limit, offset])).rows;
        case 52: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.52', { schema, table }, [operation, requestId, from, limit, offset])).rows;
        case 53: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.53', { schema, table }, [tenantId, operation, requestId, from, limit, offset])).rows;
        case 54: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.54', { schema, table }, [entity, operation, requestId, from, limit, offset])).rows;
        case 55: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.55', { schema, table }, [tenantId, entity, operation, requestId, from, limit, offset])).rows;
        case 56: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.56', { schema, table }, [actorId, requestId, from, limit, offset])).rows;
        case 57: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.57', { schema, table }, [tenantId, actorId, requestId, from, limit, offset])).rows;
        case 58: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.58', { schema, table }, [entity, actorId, requestId, from, limit, offset])).rows;
        case 59: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.59', { schema, table }, [tenantId, entity, actorId, requestId, from, limit, offset])).rows;
        case 60: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.60', { schema, table }, [operation, actorId, requestId, from, limit, offset])).rows;
        case 61: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.61', { schema, table }, [tenantId, operation, actorId, requestId, from, limit, offset])).rows;
        case 62: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.62', { schema, table }, [entity, operation, actorId, requestId, from, limit, offset])).rows;
        case 63: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.63', { schema, table }, [tenantId, entity, operation, actorId, requestId, from, limit, offset])).rows;
        case 64: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.64', { schema, table }, [to, limit, offset])).rows;
        case 65: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.65', { schema, table }, [tenantId, to, limit, offset])).rows;
        case 66: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.66', { schema, table }, [entity, to, limit, offset])).rows;
        case 67: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.67', { schema, table }, [tenantId, entity, to, limit, offset])).rows;
        case 68: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.68', { schema, table }, [operation, to, limit, offset])).rows;
        case 69: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.69', { schema, table }, [tenantId, operation, to, limit, offset])).rows;
        case 70: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.70', { schema, table }, [entity, operation, to, limit, offset])).rows;
        case 71: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.71', { schema, table }, [tenantId, entity, operation, to, limit, offset])).rows;
        case 72: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.72', { schema, table }, [actorId, to, limit, offset])).rows;
        case 73: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.73', { schema, table }, [tenantId, actorId, to, limit, offset])).rows;
        case 74: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.74', { schema, table }, [entity, actorId, to, limit, offset])).rows;
        case 75: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.75', { schema, table }, [tenantId, entity, actorId, to, limit, offset])).rows;
        case 76: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.76', { schema, table }, [operation, actorId, to, limit, offset])).rows;
        case 77: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.77', { schema, table }, [tenantId, operation, actorId, to, limit, offset])).rows;
        case 78: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.78', { schema, table }, [entity, operation, actorId, to, limit, offset])).rows;
        case 79: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.79', { schema, table }, [tenantId, entity, operation, actorId, to, limit, offset])).rows;
        case 80: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.80', { schema, table }, [requestId, to, limit, offset])).rows;
        case 81: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.81', { schema, table }, [tenantId, requestId, to, limit, offset])).rows;
        case 82: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.82', { schema, table }, [entity, requestId, to, limit, offset])).rows;
        case 83: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.83', { schema, table }, [tenantId, entity, requestId, to, limit, offset])).rows;
        case 84: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.84', { schema, table }, [operation, requestId, to, limit, offset])).rows;
        case 85: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.85', { schema, table }, [tenantId, operation, requestId, to, limit, offset])).rows;
        case 86: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.86', { schema, table }, [entity, operation, requestId, to, limit, offset])).rows;
        case 87: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.87', { schema, table }, [tenantId, entity, operation, requestId, to, limit, offset])).rows;
        case 88: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.88', { schema, table }, [actorId, requestId, to, limit, offset])).rows;
        case 89: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.89', { schema, table }, [tenantId, actorId, requestId, to, limit, offset])).rows;
        case 90: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.90', { schema, table }, [entity, actorId, requestId, to, limit, offset])).rows;
        case 91: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.91', { schema, table }, [tenantId, entity, actorId, requestId, to, limit, offset])).rows;
        case 92: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.92', { schema, table }, [operation, actorId, requestId, to, limit, offset])).rows;
        case 93: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.93', { schema, table }, [tenantId, operation, actorId, requestId, to, limit, offset])).rows;
        case 94: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.94', { schema, table }, [entity, operation, actorId, requestId, to, limit, offset])).rows;
        case 95: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.95', { schema, table }, [tenantId, entity, operation, actorId, requestId, to, limit, offset])).rows;
        case 96: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.96', { schema, table }, [from, to, limit, offset])).rows;
        case 97: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.97', { schema, table }, [tenantId, from, to, limit, offset])).rows;
        case 98: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.98', { schema, table }, [entity, from, to, limit, offset])).rows;
        case 99: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.99', { schema, table }, [tenantId, entity, from, to, limit, offset])).rows;
        case 100: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.100', { schema, table }, [operation, from, to, limit, offset])).rows;
        case 101: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.101', { schema, table }, [tenantId, operation, from, to, limit, offset])).rows;
        case 102: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.102', { schema, table }, [entity, operation, from, to, limit, offset])).rows;
        case 103: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.103', { schema, table }, [tenantId, entity, operation, from, to, limit, offset])).rows;
        case 104: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.104', { schema, table }, [actorId, from, to, limit, offset])).rows;
        case 105: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.105', { schema, table }, [tenantId, actorId, from, to, limit, offset])).rows;
        case 106: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.106', { schema, table }, [entity, actorId, from, to, limit, offset])).rows;
        case 107: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.107', { schema, table }, [tenantId, entity, actorId, from, to, limit, offset])).rows;
        case 108: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.108', { schema, table }, [operation, actorId, from, to, limit, offset])).rows;
        case 109: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.109', { schema, table }, [tenantId, operation, actorId, from, to, limit, offset])).rows;
        case 110: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.110', { schema, table }, [entity, operation, actorId, from, to, limit, offset])).rows;
        case 111: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.111', { schema, table }, [tenantId, entity, operation, actorId, from, to, limit, offset])).rows;
        case 112: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.112', { schema, table }, [requestId, from, to, limit, offset])).rows;
        case 113: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.113', { schema, table }, [tenantId, requestId, from, to, limit, offset])).rows;
        case 114: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.114', { schema, table }, [entity, requestId, from, to, limit, offset])).rows;
        case 115: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.115', { schema, table }, [tenantId, entity, requestId, from, to, limit, offset])).rows;
        case 116: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.116', { schema, table }, [operation, requestId, from, to, limit, offset])).rows;
        case 117: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.117', { schema, table }, [tenantId, operation, requestId, from, to, limit, offset])).rows;
        case 118: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.118', { schema, table }, [entity, operation, requestId, from, to, limit, offset])).rows;
        case 119: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.119', { schema, table }, [tenantId, entity, operation, requestId, from, to, limit, offset])).rows;
        case 120: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.120', { schema, table }, [actorId, requestId, from, to, limit, offset])).rows;
        case 121: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.121', { schema, table }, [tenantId, actorId, requestId, from, to, limit, offset])).rows;
        case 122: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.122', { schema, table }, [entity, actorId, requestId, from, to, limit, offset])).rows;
        case 123: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.123', { schema, table }, [tenantId, entity, actorId, requestId, from, to, limit, offset])).rows;
        case 124: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.124', { schema, table }, [operation, actorId, requestId, from, to, limit, offset])).rows;
        case 125: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.125', { schema, table }, [tenantId, operation, actorId, requestId, from, to, limit, offset])).rows;
        case 126: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.126', { schema, table }, [entity, operation, actorId, requestId, from, to, limit, offset])).rows;
        case 127: return (await executeConfiguredQuery(this.executor, 'audit.read-events.mask.127', { schema, table }, [tenantId, entity, operation, actorId, requestId, from, to, limit, offset])).rows;
        default: throw new TypeError('Unknown events audit reader filter mask');
      }
    })();
// END GENERATED audit-remaining512 events-dispatch
    return {
      items: rows.map((row) => ({
        occurredAt: toIso(row.occurred_at),
        tenantId: row.tenancy_id ?? null,
        actorId: row.actor_id ?? null,
        actorRole: row.actor_role ?? null,
        operation: row.operation ?? 'UNKNOWN',
        entity: row.entity ?? 'unknown',
        entityId: row.entity_id ?? null,
        pk: row.pk ?? null,
        requestId: row.request_id ?? null,
        ipAddress: row.ip_address ?? null,
        metadata: row.metadata ?? null,
        oldData: row.old_data ?? null,
        newData: row.new_data ?? null,
        previousHash: row.previous_hash ?? null,
        rowHash: row.row_hash ?? null,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  private async listPormLoggedActions(query: AuditSqlListQuery): Promise<AuditSqlListResult> {
    const schema = this.options.schema ?? 'audit';
    const table = this.options.table ?? 'logged_actions';
    const limit = sanitizeLimit(query.limit, 100);
    const offset = sanitizeOffset(query.offset);

// BEGIN GENERATED audit-porm32 dispatch
    let mask = 0;
    let entity: string | undefined;
    if (query.entity) {
      mask |= 1;
      entity = query.entity;
    }
    let operation: string | undefined;
    if (query.operation) {
      mask |= 2;
      operation = query.operation;
    }
    let requestId: string | undefined;
    if (query.requestId) {
      mask |= 4;
      requestId = query.requestId;
    }
    let from: string | undefined;
    if (query.from) {
      mask |= 8;
      from = query.from;
    }
    let to: string | undefined;
    if (query.to) {
      mask |= 16;
      to = query.to;
    }
    const rows = await (async () => {
      switch (mask) {
        case 0:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.0', { schema, table }, [limit, offset])).rows;
        case 1:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.1', { schema, table }, [entity, limit, offset])).rows;
        case 2:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.2', { schema, table }, [operation, limit, offset])).rows;
        case 3:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.3', { schema, table }, [entity, operation, limit, offset])).rows;
        case 4:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.4', { schema, table }, [requestId, limit, offset])).rows;
        case 5:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.5', { schema, table }, [entity, requestId, limit, offset])).rows;
        case 6:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.6', { schema, table }, [operation, requestId, limit, offset])).rows;
        case 7:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.7', { schema, table }, [entity, operation, requestId, limit, offset])).rows;
        case 8:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.8', { schema, table }, [from, limit, offset])).rows;
        case 9:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.9', { schema, table }, [entity, from, limit, offset])).rows;
        case 10:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.10', { schema, table }, [operation, from, limit, offset])).rows;
        case 11:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.11', { schema, table }, [entity, operation, from, limit, offset])).rows;
        case 12:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.12', { schema, table }, [requestId, from, limit, offset])).rows;
        case 13:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.13', { schema, table }, [entity, requestId, from, limit, offset])).rows;
        case 14:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.14', { schema, table }, [operation, requestId, from, limit, offset])).rows;
        case 15:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.15', { schema, table }, [entity, operation, requestId, from, limit, offset])).rows;
        case 16:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.16', { schema, table }, [to, limit, offset])).rows;
        case 17:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.17', { schema, table }, [entity, to, limit, offset])).rows;
        case 18:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.18', { schema, table }, [operation, to, limit, offset])).rows;
        case 19:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.19', { schema, table }, [entity, operation, to, limit, offset])).rows;
        case 20:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.20', { schema, table }, [requestId, to, limit, offset])).rows;
        case 21:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.21', { schema, table }, [entity, requestId, to, limit, offset])).rows;
        case 22:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.22', { schema, table }, [operation, requestId, to, limit, offset])).rows;
        case 23:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.23', { schema, table }, [entity, operation, requestId, to, limit, offset])).rows;
        case 24:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.24', { schema, table }, [from, to, limit, offset])).rows;
        case 25:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.25', { schema, table }, [entity, from, to, limit, offset])).rows;
        case 26:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.26', { schema, table }, [operation, from, to, limit, offset])).rows;
        case 27:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.27', { schema, table }, [entity, operation, from, to, limit, offset])).rows;
        case 28:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.28', { schema, table }, [requestId, from, to, limit, offset])).rows;
        case 29:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.29', { schema, table }, [entity, requestId, from, to, limit, offset])).rows;
        case 30:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.30', { schema, table }, [operation, requestId, from, to, limit, offset])).rows;
        case 31:
          return (await executeConfiguredQuery(this.executor, 'audit.read-porm.mask.31', { schema, table }, [entity, operation, requestId, from, to, limit, offset])).rows;
        default: throw new TypeError('Unknown PORM audit reader filter mask');
      }
    })();
// END GENERATED audit-porm32 dispatch
    return {
      items: rows.map((row) => ({
        occurredAt: toIso(row.occurred_at),
        operation: row.op ?? 'UNKNOWN',
        entity: `${row.schema_name ?? 'unknown'}.${row.table_name ?? 'unknown'}`,
        requestId: row.request_id ?? null,
        oldData: row.old_data ?? null,
        newData: row.new_data ?? null,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }
}
