import { Injectable } from '@nestjs/common';
import { Database } from '@stynx/data';
import { camelizeRow, pageLimitOffset, type FlowRow } from './row-utils';

type AnalyticsQuery = Record<string, unknown>;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function addUuidFilter(where: string[], values: unknown[], column: string, value: unknown): void {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return;
  }
  values.push(stringValue);
  where.push(`${column} = $${values.length}::uuid`);
}

function addTextFilter(where: string[], values: unknown[], column: string, value: unknown): void {
  const stringValue = optionalString(value);
  if (!stringValue) {
    return;
  }
  values.push(stringValue);
  where.push(`${column} = $${values.length}`);
}

@Injectable()
export class FlowAnalyticsService {
  constructor(private readonly db: Database) {}

  openTasks(query: AnalyticsQuery = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const where: string[] = [`t.status = 'open'`];
    const values: unknown[] = [];
    addUuidFilter(where, values, 'r.scope_id', query.scopeId);
    addUuidFilter(where, values, 'r.graph_id', query.graphId);
    addTextFilter(where, values, 's.code', query.scopeCode);
    addTextFilter(where, values, 'r.target_type', query.targetType);
    addTextFilter(where, values, 'r.target_id', query.targetId);
    addUuidFilter(where, values, 't.assignee_user_id', query.assigneeUserId);
    const whereSql = `where ${where.join(' and ')}`;

    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(
        `
          select t.*, r.target_type, r.target_id, n.code as node_code, n.name as node_name
          from flow.tasks t
          join flow.runs r on r.id = t.run_id
          join flow.scopes s on s.id = r.scope_id
          join flow.nodes n on n.id = t.node_id
          ${whereSql}
          order by t.due_at nulls last, t.created_at asc
          limit $${values.length + 1} offset $${values.length + 2}
        `,
        [...values, limit, offset],
      );
      const total = await trx.query<{ total: string }>(
        `
          select count(*)::text as total
          from flow.tasks t
          join flow.runs r on r.id = t.run_id
          join flow.scopes s on s.id = r.scope_id
          ${whereSql}
        `,
        values,
      );
      return {
        data: result.rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  runsSummary(query: AnalyticsQuery = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const where: string[] = [];
    const values: unknown[] = [];
    addUuidFilter(where, values, 'r.scope_id', query.scopeId);
    addUuidFilter(where, values, 'r.graph_id', query.graphId);
    addTextFilter(where, values, 's.code', query.scopeCode);
    addTextFilter(where, values, 'r.target_type', query.targetType);
    addTextFilter(where, values, 'r.target_id', query.targetId);
    addTextFilter(where, values, 'r.status', query.status);
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';

    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(
        `
          with grouped as (
            select
              r.scope_id,
              r.graph_id,
              r.status,
              count(*)::int as run_count,
              min(r.created_at) as first_created_at,
              max(r.updated_at) as last_updated_at
            from flow.runs r
            join flow.scopes s on s.id = r.scope_id
            ${whereSql}
            group by r.scope_id, r.graph_id, r.status
          )
          select * from grouped
          order by last_updated_at desc
          limit $${values.length + 1} offset $${values.length + 2}
        `,
        [...values, limit, offset],
      );
      const total = await trx.query<{ total: string }>(
        `
          with grouped as (
            select r.scope_id, r.graph_id, r.status
            from flow.runs r
            join flow.scopes s on s.id = r.scope_id
            ${whereSql}
            group by r.scope_id, r.graph_id, r.status
          )
          select count(*)::text as total from grouped
        `,
        values,
      );
      return {
        data: result.rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(total.rows[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }
}
