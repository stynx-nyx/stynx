import { bindQueryContext, executeConfiguredQuery, executeTypedQuery } from '@stynx-nyx/data';
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

type SelectRow = {
  occurred_at: string | Date | number;
  table_schema?: string;
  tenant_id?: string | null;
  tenancy_id?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  operation?: string;
  entity?: string;
  entity_id?: string | null;
  row_id?: string | null;
  pk?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  request_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  old_data?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  new_data?: Record<string, unknown> | unknown[] | string | number | boolean | null;
  previous_hash?: string | null;
  row_hash?: string | null;
  payload?: Record<string, unknown> | null;
  op?: string;
  schema_name?: string;
  table_name?: string;
  total?: number;
};

function toRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: T[] })?.rows;
  return Array.isArray(rows) ? rows : [];
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

    const whereParts: string[] = [];
    const params: unknown[] = [];
    let index = 1;

    if (query.tenantId) {
      whereParts.push(`tenant_id::text = $${index++}`);
      params.push(query.tenantId);
    }
    if (query.entity) {
      whereParts.push(`(table_schema || '.' || table_name) = $${index++}`);
      params.push(query.entity);
    }
    if (query.operation) {
      whereParts.push(`operation = $${index++}`);
      params.push(query.operation);
    }
    if (query.actorId) {
      whereParts.push(`actor_id::text = $${index++}`);
      params.push(query.actorId);
    }
    if (query.requestId) {
      whereParts.push(`request_id = $${index++}`);
      params.push(query.requestId);
    }
    if (query.from) {
      whereParts.push(`occurred_at >= $${index++}::timestamptz`);
      params.push(query.from);
    }
    if (query.to) {
      whereParts.push(`occurred_at <= $${index++}::timestamptz`);
      params.push(query.to);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const querySql = `SELECT
        occurred_at,
        tenant_id,
        actor_id,
        operation,
        table_schema,
        table_name,
        row_id,
        request_id,
        tags,
        payload,
        COUNT(*) OVER() AS total
      FROM ${schema}.${table}
      ${whereSql}
      ORDER BY occurred_at DESC, id DESC
      LIMIT $${index++}
      OFFSET $${index}`;
    params.push(limit, offset);

    const rows = toRows<SelectRow & { tags?: Record<string, unknown> | null }>(
      await this.executor.query(querySql, params),
    );
    return {
      items: rows.map((row) => ({
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
        oldData: (row.payload?.old ?? null) as Record<string, unknown> | null,
        newData: (row.payload?.new ?? null) as Record<string, unknown> | null,
      })),
      total: Number(rows[0]?.total ?? 0),
    };
  }

  private async listStynxEvents(query: AuditSqlListQuery): Promise<AuditSqlListResult> {
    const schema = this.options.schema ?? 'audit';
    const table = this.options.table ?? 'events';
    const limit = sanitizeLimit(query.limit, 100);
    const offset = sanitizeOffset(query.offset);

    const whereParts: string[] = [];
    const params: unknown[] = [];
    let index = 1;

    if (query.tenantId) {
      whereParts.push(`tenancy_id::text = $${index++}`);
      params.push(query.tenantId);
    }
    if (query.entity) {
      whereParts.push(`entity = $${index++}`);
      params.push(query.entity);
    }
    if (query.operation) {
      whereParts.push(`operation = $${index++}`);
      params.push(query.operation);
    }
    if (query.actorId) {
      whereParts.push(`actor_id::text = $${index++}`);
      params.push(query.actorId);
    }
    if (query.requestId) {
      whereParts.push(`request_id = $${index++}`);
      params.push(query.requestId);
    }
    if (query.from) {
      whereParts.push(`occurred_at >= $${index++}::timestamptz`);
      params.push(query.from);
    }
    if (query.to) {
      whereParts.push(`occurred_at <= $${index++}::timestamptz`);
      params.push(query.to);
    }

    const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
    const querySql = `SELECT
        occurred_at,
        tenancy_id,
        actor_id,
        actor_role,
        operation,
        entity,
        entity_id,
        pk,
        request_id,
        ip_address,
        metadata,
        old_data,
        new_data,
        previous_hash,
        row_hash,
        COUNT(*) OVER() AS total
      FROM ${schema}.${table}
      ${whereSql}
      ORDER BY occurred_at DESC
      LIMIT $${index++}
      OFFSET $${index}`;
    params.push(limit, offset);

    const rows = toRows<SelectRow>(await this.executor.query(querySql, params));
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
