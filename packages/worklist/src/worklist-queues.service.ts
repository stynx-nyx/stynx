import { selectQueueUpdateQuery } from './queue-update.repository.js';
import { createQueue, readQueue, readQueueByCode, listQueues, countQueues, assertCanWork, setWorkerState } from './worklist.repository.js';
import { Injectable } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { WorklistNotFoundError } from './errors.js';
import {
  mapQueueRow,
  mapWorkerStateRow,
  pageLimitOffset,
} from './row-utils.js';
import { mapWorklistSqlError } from './sql-errors.js';
import type {
  CreateWorklistQueueInput,
  SetWorklistWorkerStateInput,
  UpdateWorklistQueueInput,
  WorklistPage,
  WorklistQueueRecord,
  WorklistWorkerStateRecord,
} from './types.js';
import {
  createQueueSchema,
  pageQuerySchema,
  parseWorklistInput,
  updateQueueSchema,
  workerStateSchema,
} from './validation.js';

@Injectable()
export class WorklistQueuesService {
  constructor(private readonly database: Database) {}

  async create(input: CreateWorklistQueueInput): Promise<WorklistQueueRecord> {
    const value = parseWorklistInput(createQueueSchema, input);
    const defaultDeadline = value.defaultDeadline;
    try {
      return await this.database.tx(async (trx) => {
        const result = await trx.run(createQueue,
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
        return mapQueueRow(result[0] ?? {});
      });
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  async update(id: string, input: UpdateWorklistQueueInput): Promise<WorklistQueueRecord> {
    const value = parseWorklistInput(updateQueueSchema, input);
    let mask = 0;
    const parameters: unknown[] = [id];
    const add = (bit: number, valueToSet: unknown) => {
      parameters.push(valueToSet);
      mask |= bit;
    };

    if (value.name !== undefined) add(1, value.name);
    if (value.description !== undefined) add(2, value.description);
    /* v8 ignore else -- updateQueueSchema inherits createQueueSchema's strategy default ('pull'), so a parsed update never lacks it */
    if (value.strategy !== undefined) add(0, value.strategy);
    if (value.strategyConfig !== undefined)
      add(4, JSON.stringify(value.strategyConfig));
    if (value.requiredPermission !== undefined)
      add(8, value.requiredPermission);
    if (value.supervisorPermission !== undefined)
      add(16, value.supervisorPermission);
    if (value.claimLimit !== undefined) add(32, value.claimLimit);
    if (value.meta !== undefined) add(64, JSON.stringify(value.meta));
    if (value.defaultDeadline !== undefined) {
      add(
        128,
        value.defaultDeadline?.kind === 'elapsed' ? value.defaultDeadline.seconds : null,
      );
      add(
        128,
        value.defaultDeadline?.kind === 'business_days' ? value.defaultDeadline.businessDays : null,
      );
      add(
        128,
        value.defaultDeadline?.kind === 'business_days'
          ? (value.defaultDeadline.calendarKey ?? null)
          : null,
      );
    }

    try {
      return await this.database.tx(async (trx) => {
        const result = await trx.run(selectQueueUpdateQuery(mask), parameters);
        const row = result[0];
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
        trx.run(readQueue, [id]),
      { role: 'reader', readonly: true },
    );
    const row = result[0];
    if (!row) throw new WorklistNotFoundError('queue', id);
    return mapQueueRow(row);
  }

  async getByCode(code: string): Promise<WorklistQueueRecord> {
    const result = await this.database.tx(
      (trx) =>
        trx.run(readQueueByCode, [
          code,
        ]),
      { role: 'reader', readonly: true },
    );
    const row = result[0];
    if (!row) throw new WorklistNotFoundError('queue', code);
    return mapQueueRow(row);
  }

  async list(input: unknown = {}): Promise<WorklistPage<WorklistQueueRecord>> {
    const query = parseWorklistInput(pageQuerySchema, input);
    const { limit, offset } = pageLimitOffset(query);
    return this.database.tx(
      async (trx) => {
        const [rows, count] = await Promise.all([
          trx.run(listQueues,
            [limit, offset],
          ),
          trx.run(countQueues, []),
        ]);
        return {
          data: rows.map(mapQueueRow),
          meta: {
            page: query.page,
            pageSize: query.pageSize,
            total: Number(count[0]?.total ?? 0),
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
        await trx.run(assertCanWork, [queueId, value.userId]);
        const result = await trx.run(setWorkerState,
          [
            queueId,
            value.userId,
            value.available,
            value.weight ?? 1,
            JSON.stringify(value.meta ?? {}),
          ],
        );
        return mapWorkerStateRow(result[0] ?? {});
      });
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }
}
