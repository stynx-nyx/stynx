import { Injectable } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { camelizeRow, pageLimitOffset } from './row-utils.js';
import * as queries from './analytics.repository.js';

export type AnalyticsQuery = Record<string, unknown>;

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Select only a finite literal definition; values retain their original bind order. */
function filters(query: AnalyticsQuery, keys: readonly string[]): { mask: number; values: string[] } {
  let mask = 0;
  const values: string[] = [];
  for (const [index, key] of keys.entries()) {
    const value = optionalString(query[key]);
    if (value === undefined) continue;
    mask |= 1 << index;
    values.push(value);
  }
  return { mask, values };
}

const commonFilters = ['scopeId', 'graphId', 'scopeCode'] as const;
const taskFilters = [...commonFilters, 'targetType', 'targetId', 'assigneeUserId'] as const;
const summaryFilters = [...commonFilters, 'targetType', 'targetId', 'status'] as const;

@Injectable()
export class FlowAnalyticsService {
  constructor(private readonly db: Database) {}

  openTasks(query: AnalyticsQuery = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const { mask, values } = filters(query, taskFilters);
    return this.db.tx(async (trx) => {
      const rows = await trx.run(queries.selectOpenTaskQuery(mask), [...values, limit, offset]);
      const totals = await trx.run(queries.selectOpenTaskCountQuery(mask), values);
      return {
        data: rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(totals[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  runsSummary(query: AnalyticsQuery = {}): Promise<Record<string, unknown>> {
    const { limit, offset, page, pageSize } = pageLimitOffset(query);
    const { mask, values } = filters(query, summaryFilters);
    return this.db.tx(async (trx) => {
      const rows = await trx.run(queries.selectRunsSummaryQuery(mask), [...values, limit, offset]);
      const totals = await trx.run(queries.selectRunsSummaryCountQuery(mask), values);
      return {
        data: rows.map(camelizeRow),
        meta: { page, pageSize, total: Number(totals[0]?.total ?? 0) },
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }

  dashboard(query: AnalyticsQuery = {}): Promise<Record<string, unknown>> {
    const { mask, values } = filters(query, commonFilters);
    return this.db.tx(async (trx) => {
      const openTasks = await trx.run(queries.selectDashboardOpenTaskQuery(mask), values);
      const cycleTime = await trx.run(queries.selectDashboardCycleTimeQuery(mask), values);
      const completion = await trx.run(queries.selectDashboardCompletionQuery(mask), values);
      const slaBreaches = await trx.run(queries.selectDashboardSlaBreachQuery(mask), values);
      const completionRows = new Map(
        completion.map((row) => [row.window, Number(row.total) > 0 ? Number(row.completed) / Number(row.total) : 0]),
      );
      return {
        openTasks: Number(openTasks[0]?.total ?? 0),
        cycleTime: {
          p50Seconds: Math.round(Number(cycleTime[0]?.p50_seconds ?? 0)),
          p95Seconds: Math.round(Number(cycleTime[0]?.p95_seconds ?? 0)),
        },
        completionRate: {
          last7Days: completionRows.get('last7Days') ?? 0,
          last30Days: completionRows.get('last30Days') ?? 0,
        },
        slaBreaches: Number(slaBreaches[0]?.total ?? 0),
      };
    }, {
      role: 'reader',
      readonly: true,
    });
  }
}
