import type { AuditEventEnvelope, AuditSink } from '@stynx/contracts';

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
  occurredAt: string;
  tenantId?: string | null;
  actorId?: string | null;
  actorRole?: string | null;
  operation: string;
  entity: string;
  entityId?: string | null;
  pk?: Record<string, unknown> | null;
  requestId?: string | null;
  ipAddress?: string | null;
  metadata?: Record<string, unknown> | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
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

export class AuditSqlSink implements AuditSink {
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

  private async writeUsingFunction(event: AuditEventEnvelope): Promise<void> {
    const pk = event.pk ?? (event.entityId ? { id: event.entityId } : undefined);
    await this.executor.query(
      `SELECT audit.write(
         $1::uuid,
         $2::uuid,
         $3::text,
         $4::text,
         $5::text,
         $6::text,
         $7::jsonb,
         $8::text,
         $9::text,
         $10::text,
         $11::jsonb,
         $12::jsonb,
         $13::jsonb
       )`,
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
    await this.executor.query(
      `INSERT INTO ${schema}.${table} (
         occurred_at,
         actor_sub,
         action,
         resource_type,
         resource_id,
         request_id,
         ip_address,
         metadata
       ) VALUES (
         $1::timestamptz,
         $2::text,
         $3::text,
         $4::text,
         $5::text,
         $6::text,
         NULLIF($7::text, ''),
         $8::jsonb
       )`,
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
  occurred_at: string | Date;
  table_schema?: string;
  tenant_id?: string | null;
  tenancy_id?: string | null;
  actor_id?: string | null;
  actor_role?: string | null;
  operation?: string;
  entity?: string;
  entity_id?: string | null;
  row_id?: string | null;
  pk?: Record<string, unknown> | null;
  request_id?: string | null;
  ip_address?: string | null;
  metadata?: Record<string, unknown> | null;
  old_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown> | null;
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

function toIso(value: string | Date): string {
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

    const whereParts: string[] = [];
    const params: unknown[] = [];
    let index = 1;

    if (query.entity) {
      whereParts.push(`(schema_name || '.' || table_name) = $${index++}`);
      params.push(query.entity);
    }
    if (query.operation) {
      whereParts.push(`op = $${index++}`);
      params.push(query.operation);
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
        op,
        schema_name,
        table_name,
        old_data,
        new_data,
        request_id,
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
