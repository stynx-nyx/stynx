import { Injectable } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { WorklistNotFoundError } from './errors';
import {
  QUEUE_COLUMNS,
  WORKER_STATE_COLUMNS,
  mapQueueRow,
  mapWorkerStateRow,
  pageLimitOffset,
  type WorklistRow,
} from './row-utils';
import { mapWorklistSqlError } from './sql-errors';
import type {
  CreateWorklistQueueInput,
  SetWorklistWorkerStateInput,
  UpdateWorklistQueueInput,
  WorklistPage,
  WorklistQueueRecord,
  WorklistWorkerStateRecord,
} from './types';
import {
  createQueueSchema,
  pageQuerySchema,
  parseWorklistInput,
  updateQueueSchema,
  workerStateSchema,
} from './validation';

@Injectable()
export class WorklistQueuesService {
  constructor(private readonly database: Database) {}

  async create(input: CreateWorklistQueueInput): Promise<WorklistQueueRecord> {
    const value = parseWorklistInput(createQueueSchema, input);
    const defaultDeadline = value.defaultDeadline;
    try {
      return await this.database.tx(async (trx) => {
        const result = await trx.query<WorklistRow>(
          `insert into worklist.queues (
             tenant_id, code, name, description, strategy, strategy_config,
             required_permission, supervisor_permission, claim_limit,
             default_sla_seconds, default_sla_business_days, default_calendar_key,
             meta, created_by, updated_by
           ) values (
             current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5::jsonb,
             $6, $7, $8, $9, $10, $11, $12::jsonb,
             current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid
           ) returning ${QUEUE_COLUMNS}`,
          [
            value.code,
            value.name,
            value.description ?? null,
            value.strategy,
            JSON.stringify(value.strategyConfig ?? {}),
            value.requiredPermission,
            value.supervisorPermission,
            value.claimLimit ?? null,
            defaultDeadline?.kind === 'elapsed' ? defaultDeadline.seconds : null,
            defaultDeadline?.kind === 'business_days' ? defaultDeadline.businessDays : null,
            defaultDeadline?.kind === 'business_days'
              ? (defaultDeadline.calendarKey ?? null)
              : null,
            JSON.stringify(value.meta ?? {}),
          ],
        );
        return mapQueueRow(result.rows[0] ?? {});
      });
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  async update(id: string, input: UpdateWorklistQueueInput): Promise<WorklistQueueRecord> {
    const value = parseWorklistInput(updateQueueSchema, input);
    const assignments: string[] = [];
    const parameters: unknown[] = [id];
    const add = (column: string, valueToSet: unknown, cast = '') => {
      parameters.push(valueToSet);
      assignments.push(`${column} = $${parameters.length}${cast}`);
    };

    if (value.name !== undefined) add('name', value.name);
    if (value.description !== undefined) add('description', value.description);
    if (value.strategy !== undefined) add('strategy', value.strategy);
    if (value.strategyConfig !== undefined)
      add('strategy_config', JSON.stringify(value.strategyConfig), '::jsonb');
    if (value.requiredPermission !== undefined)
      add('required_permission', value.requiredPermission);
    if (value.supervisorPermission !== undefined)
      add('supervisor_permission', value.supervisorPermission);
    if (value.claimLimit !== undefined) add('claim_limit', value.claimLimit);
    if (value.meta !== undefined) add('meta', JSON.stringify(value.meta), '::jsonb');
    if (value.defaultDeadline !== undefined) {
      add(
        'default_sla_seconds',
        value.defaultDeadline?.kind === 'elapsed' ? value.defaultDeadline.seconds : null,
      );
      add(
        'default_sla_business_days',
        value.defaultDeadline?.kind === 'business_days' ? value.defaultDeadline.businessDays : null,
      );
      add(
        'default_calendar_key',
        value.defaultDeadline?.kind === 'business_days'
          ? (value.defaultDeadline.calendarKey ?? null)
          : null,
      );
    }
    assignments.push(`updated_at = clock_timestamp()`);
    assignments.push(`updated_by = current_setting('app.actor_id')::uuid`);

    try {
      return await this.database.tx(async (trx) => {
        const result = await trx.query<WorklistRow>(
          `update worklist.queues set ${assignments.join(', ')} where id = $1 returning ${QUEUE_COLUMNS}`,
          parameters,
        );
        const row = result.rows[0];
        if (!row) throw new WorklistNotFoundError('queue', id);
        return mapQueueRow(row);
      });
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  async get(id: string): Promise<WorklistQueueRecord> {
    const result = await this.database.tx(
      (trx) =>
        trx.query<WorklistRow>(`select ${QUEUE_COLUMNS} from worklist.queues where id = $1`, [id]),
      { role: 'reader', readonly: true },
    );
    const row = result.rows[0];
    if (!row) throw new WorklistNotFoundError('queue', id);
    return mapQueueRow(row);
  }

  async getByCode(code: string): Promise<WorklistQueueRecord> {
    const result = await this.database.tx(
      (trx) =>
        trx.query<WorklistRow>(`select ${QUEUE_COLUMNS} from worklist.queues where code = $1`, [
          code,
        ]),
      { role: 'reader', readonly: true },
    );
    const row = result.rows[0];
    if (!row) throw new WorklistNotFoundError('queue', code);
    return mapQueueRow(row);
  }

  async list(input: unknown = {}): Promise<WorklistPage<WorklistQueueRecord>> {
    const query = parseWorklistInput(pageQuerySchema, input);
    const { limit, offset } = pageLimitOffset(query);
    return this.database.tx(
      async (trx) => {
        const [rows, count] = await Promise.all([
          trx.query<WorklistRow>(
            `select ${QUEUE_COLUMNS} from worklist.queues order by code, id limit $1 offset $2`,
            [limit, offset],
          ),
          trx.query<{ total: string }>(`select count(*)::text as total from worklist.queues`),
        ]);
        return {
          data: rows.rows.map(mapQueueRow),
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: Number(count.rows[0]?.total ?? 0),
          },
        };
      },
      { role: 'reader', readonly: true },
    );
  }

  async setWorkerState(
    queueId: string,
    input: SetWorklistWorkerStateInput,
  ): Promise<WorklistWorkerStateRecord> {
    const value = parseWorklistInput(workerStateSchema, input);
    try {
      return await this.database.tx(async (trx) => {
        await trx.query(`select worklist.assert_can_work($1, $2, true)`, [queueId, value.userId]);
        const result = await trx.query<WorklistRow>(
          `insert into worklist.worker_state (
             tenant_id, queue_id, user_id, is_available, weight, meta, created_by, updated_by
           ) values (
             current_setting('app.tenant_id')::uuid, $1, $2, $3, $4, $5::jsonb,
             current_setting('app.actor_id')::uuid, current_setting('app.actor_id')::uuid
           )
           on conflict (tenant_id, queue_id, user_id) do update set
             is_available = excluded.is_available,
             weight = excluded.weight,
             meta = excluded.meta,
             updated_by = excluded.updated_by,
             updated_at = clock_timestamp()
           returning ${WORKER_STATE_COLUMNS}`,
          [
            queueId,
            value.userId,
            value.available,
            value.weight ?? 1,
            JSON.stringify(value.meta ?? {}),
          ],
        );
        return mapWorkerStateRow(result.rows[0] ?? {});
      });
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }
}
