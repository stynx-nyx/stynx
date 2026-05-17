import { Injectable } from '@nestjs/common';
import { Database } from '@stynx/data';
import { camelizeRow, type FlowRow } from './row-utils';

@Injectable()
export class FlowAnalyticsService {
  constructor(private readonly db: Database) {}

  openTasks(): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(
        `
          select t.*, r.target_type, r.target_id, n.code as node_code, n.name as node_name
          from flow.tasks t
          join flow.runs r on r.id = t.run_id
          join flow.nodes n on n.id = t.node_id
          where t.status = 'open'
          order by t.due_at nulls last, t.created_at asc
        `,
      );
      return result.rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  runsSummary(): Promise<Record<string, unknown>[]> {
    return this.db.tx(async (trx) => {
      const result = await trx.query<FlowRow>(
        `
          select
            r.scope_id,
            r.graph_id,
            r.status,
            count(*)::int as run_count,
            min(r.created_at) as first_created_at,
            max(r.updated_at) as last_updated_at
          from flow.runs r
          group by r.scope_id, r.graph_id, r.status
          order by last_updated_at desc
        `,
      );
      return result.rows.map(camelizeRow);
    }, {
      role: 'reader',
      readonly: true,
    });
  }
}
