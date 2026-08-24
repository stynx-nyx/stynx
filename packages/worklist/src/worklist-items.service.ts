import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { resolveWorklistDeadline } from './deadline';
import { WorklistConflictError, WorklistInputError, WorklistNotFoundError } from './errors';
import {
  EVENT_COLUMNS,
  ITEM_COLUMNS,
  mapCandidateRow,
  mapEventRow,
  mapItemRow,
  pageLimitOffset,
  type WorklistRow,
} from './row-utils';
import {
  WORKLIST_BUSINESS_CALENDAR,
  WORKLIST_CLOCK,
  WORKLIST_EVENT_SINK,
  type WorklistBusinessCalendar,
  type WorklistClock,
  type WorklistEventSink,
} from './ports';
import { mapWorklistSqlError } from './sql-errors';
import { WorklistStrategyRegistry } from './strategies';
import type {
  EnqueueWorkItemInput,
  WorklistCandidate,
  WorklistEvent,
  WorklistItemRecord,
  WorklistPage,
  WorklistSupervisorOverrideInput,
} from './types';
import {
  enqueueWorkItemSchema,
  eventListQuerySchema,
  itemListQuerySchema,
  parseWorklistInput,
  supervisorOverrideSchema,
} from './validation';
import { WorklistQueuesService } from './worklist-queues.service';

interface ItemMutationResult {
  item: WorklistItemRecord;
  events: WorklistEvent[];
}

@Injectable()
export class WorklistItemsService {
  constructor(
    private readonly database: Database,
    private readonly requestContext: RequestContext,
    private readonly queues: WorklistQueuesService,
    private readonly strategies: WorklistStrategyRegistry,
    @Inject(WORKLIST_BUSINESS_CALENDAR)
    private readonly calendar: WorklistBusinessCalendar | null,
    @Inject(WORKLIST_CLOCK)
    private readonly clock: WorklistClock,
    @Inject(WORKLIST_EVENT_SINK)
    private readonly eventSink: WorklistEventSink,
  ) {}

  async enqueue(input: EnqueueWorkItemInput): Promise<WorklistItemRecord> {
    const value = parseWorklistInput(enqueueWorkItemSchema, input);
    const queue = await this.queues.getByCode(value.queueCode);
    const tenantId = this.requireTenantId();
    const deadline = await resolveWorklistDeadline({
      tenantId,
      now: this.clock.now(),
      ...(value.deadline ? { deadline: value.deadline } : {}),
      queueDefault: queue.defaultDeadline,
      calendar: this.calendar,
    });

    try {
      const mutation = await this.database.tx(async (trx) => {
        const created = await trx.query<{ item_id: string }>(
          `select worklist.item_enqueue(
             $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb
           ) as item_id`,
          [
            value.queueCode,
            value.entityType,
            value.entityId,
            value.priority ?? null,
            deadline?.dueAt ?? null,
            deadline?.kind ?? null,
            deadline?.businessDays ?? null,
            deadline?.calendarKey ?? null,
            JSON.stringify(value.payload ?? {}),
            JSON.stringify(value.meta ?? {}),
          ],
        );
        const itemId = created.rows[0]?.item_id;
        if (!itemId) throw new WorklistConflictError('Worklist enqueue returned no item');
        return this.mutationResult(trx, itemId);
      });
      await this.publish(mutation.events);
      return mutation.item;
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  async claimNext(queueId: string, userId?: string): Promise<WorklistItemRecord | null> {
    return this.claimingMutation(`select worklist.item_claim_next($1, $2) as item_id`, [
      queueId,
      userId ?? null,
    ]);
  }

  async claim(itemId: string, userId?: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.query(`select worklist.item_claim($1, $2)`, [itemId, userId ?? null]),
    );
  }

  async assignNext(queueId: string): Promise<WorklistItemRecord | null> {
    const queue = await this.queues.get(queueId);
    if (queue.strategy === 'pull') {
      throw new WorklistConflictError('Pull queues distribute through claimNext', { queueId });
    }
    if (queue.strategy === 'round_robin' || queue.strategy === 'load_balanced') {
      return this.claimingMutation(`select worklist.assign_next($1) as item_id`, [queueId]);
    }

    const strategy = this.strategies.require(queue.strategy);
    const candidates = await this.eligibleCandidates(queueId);
    const selected = await strategy.select({
      queueId,
      candidates,
      strategyConfig: queue.strategyConfig,
    });
    if (selected === null) return null;
    if (!candidates.some((candidate) => candidate.userId === selected)) {
      throw new WorklistInputError(
        'Custom strategy selected a user outside the eligible candidate set',
        {
          queueId,
          strategy: queue.strategy,
          selected,
        },
      );
    }
    return this.claimingMutation(`select worklist.item_assign_next($1, $2, $3) as item_id`, [
      queueId,
      selected,
      queue.strategy,
    ]);
  }

  async release(itemId: string, reason?: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.query(`select worklist.item_release($1, $2, false)`, [itemId, reason ?? null]),
    );
  }

  async complete(
    itemId: string,
    note?: string,
    payload?: Record<string, unknown>,
  ): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.query(`select worklist.item_complete($1, $2, $3::jsonb, false)`, [
        itemId,
        note ?? null,
        JSON.stringify(payload ?? {}),
      ]),
    );
  }

  async cancel(itemId: string, reason: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.query(`select worklist.item_cancel($1, $2)`, [itemId, reason]),
    );
  }

  async reassign(itemId: string, toUserId: string, reason: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.query(`select worklist.item_reassign($1, $2, $3, false)`, [itemId, toUserId, reason]),
    );
  }

  async supervisorOverride(input: WorklistSupervisorOverrideInput): Promise<WorklistItemRecord> {
    const value = parseWorklistInput(supervisorOverrideSchema, input);
    if (value.operation === 'release') {
      return this.itemMutation(value.itemId, (trx) =>
        trx.query(`select worklist.item_release($1, $2, true)`, [value.itemId, value.reason]),
      );
    }
    if (value.operation === 'complete') {
      return this.itemMutation(value.itemId, (trx) =>
        trx.query(`select worklist.item_complete($1, $2, $3::jsonb, true)`, [
          value.itemId,
          value.reason,
          JSON.stringify(value.payload ?? {}),
        ]),
      );
    }
    return this.itemMutation(value.itemId, (trx) =>
      trx.query(`select worklist.item_reassign($1, $2, $3, true)`, [
        value.itemId,
        value.toUserId,
        value.reason,
      ]),
    );
  }

  async get(id: string): Promise<WorklistItemRecord> {
    return this.database.tx((trx) => this.getInTransaction(trx, id), {
      role: 'reader',
      readonly: true,
    });
  }

  async list(input: unknown = {}): Promise<WorklistPage<WorklistItemRecord>> {
    const query = parseWorklistInput(itemListQuerySchema, input);
    const { limit, offset } = pageLimitOffset(query);
    const predicates: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      predicates.push(sql.replace('?', `$${values.length}`));
    };
    if (query.queueId) add('queue_id = ?', query.queueId);
    if (query.status) add('status = ?::worklist.item_status', query.status);
    if (query.assigneeId) add('assignee_id = ?', query.assigneeId);
    if (query.entityType) add('entity_type = ?', query.entityType);
    const where = predicates.length > 0 ? `where ${predicates.join(' and ')}` : '';
    values.push(limit, offset);

    return this.database.tx(
      async (trx) => {
        const rows = await trx.query<WorklistRow>(
          `select ${ITEM_COLUMNS} from worklist.items ${where}
         order by priority, due_at asc nulls last, created_at, id
         limit $${values.length - 1} offset $${values.length}`,
          values,
        );
        const count = await trx.query<{ total: string }>(
          `select count(*)::text as total from worklist.items ${where}`,
          values.slice(0, -2),
        );
        return {
          data: rows.rows.map(mapItemRow),
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

  async listEvents(input: unknown = {}): Promise<WorklistPage<WorklistEvent>> {
    const query = parseWorklistInput(eventListQuerySchema, input);
    const { limit, offset } = pageLimitOffset(query);
    const predicates: string[] = [];
    const values: unknown[] = [];
    const add = (sql: string, value: unknown) => {
      values.push(value);
      predicates.push(sql.replace('?', `$${values.length}`));
    };
    if (query.itemId) add('item_id = ?', query.itemId);
    if (query.after) add('created_at > ?', query.after);
    if (query.afterId) add('id > ?', query.afterId);
    const where = predicates.length > 0 ? `where ${predicates.join(' and ')}` : '';
    values.push(limit, offset);

    return this.database.tx(
      async (trx) => {
        const rows = await trx.query<WorklistRow>(
          `select ${EVENT_COLUMNS} from worklist.item_events ${where}
         order by created_at, id limit $${values.length - 1} offset $${values.length}`,
          values,
        );
        const count = await trx.query<{ total: string }>(
          `select count(*)::text as total from worklist.item_events ${where}`,
          values.slice(0, -2),
        );
        return {
          data: rows.rows.map(mapEventRow),
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

  private async claimingMutation(
    sql: string,
    values: unknown[],
  ): Promise<WorklistItemRecord | null> {
    try {
      const mutation = await this.database.tx(async (trx) => {
        const result = await trx.query<{ item_id: string | null }>(sql, values);
        const itemId = result.rows[0]?.item_id;
        if (!itemId) return null;
        const item = await this.getInTransaction(trx, itemId);
        const event = await trx.query<WorklistRow>(
          `select ${EVENT_COLUMNS} from worklist.item_events
           where item_id = $1 order by created_at desc, id desc limit 1`,
          [itemId],
        );
        return {
          item,
          events: event.rows.map(mapEventRow),
        };
      });
      if (!mutation) return null;
      await this.publish(mutation.events);
      return mutation.item;
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  private async itemMutation(
    itemId: string,
    mutate: (trx: Transaction) => Promise<unknown>,
  ): Promise<WorklistItemRecord> {
    try {
      const mutation = await this.database.tx(async (trx) => {
        const before = await trx.query<{ total: string }>(
          `select count(*)::text as total from worklist.item_events where item_id = $1`,
          [itemId],
        );
        await mutate(trx);
        const item = await this.getInTransaction(trx, itemId);
        const events = await trx.query<WorklistRow>(
          `select ${EVENT_COLUMNS} from worklist.item_events
           where item_id = $1 order by created_at, id offset $2`,
          [itemId, Number(before.rows[0]?.total ?? 0)],
        );
        return { item, events: events.rows.map(mapEventRow) };
      });
      await this.publish(mutation.events);
      return mutation.item;
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  private async mutationResult(trx: Transaction, itemId: string): Promise<ItemMutationResult> {
    const item = await this.getInTransaction(trx, itemId);
    const events = await trx.query<WorklistRow>(
      `select ${EVENT_COLUMNS} from worklist.item_events where item_id = $1 order by created_at, id`,
      [itemId],
    );
    return { item, events: events.rows.map(mapEventRow) };
  }

  private async getInTransaction(trx: Transaction, id: string): Promise<WorklistItemRecord> {
    const result = await trx.query<WorklistRow>(
      `select ${ITEM_COLUMNS} from worklist.items where id = $1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) throw new WorklistNotFoundError('item', id);
    return mapItemRow(row);
  }

  private async eligibleCandidates(queueId: string): Promise<WorklistCandidate[]> {
    const result = await this.database.tx(
      (trx) =>
        trx.query<WorklistRow>(
          `select user_id as "userId", is_available as available, weight,
           last_assigned_at as "lastAssignedAt", open_item_count as "openItemCount"
         from worklist.eligible_workers($1)`,
          [queueId],
        ),
      { role: 'reader', readonly: true },
    );
    return result.rows.map(mapCandidateRow);
  }

  private async publish(events: WorklistEvent[]): Promise<void> {
    for (const event of events) {
      await this.eventSink.publish(event);
    }
  }

  private requireTenantId(): string {
    const tenantId = this.requestContext.tenantId;
    if (!tenantId) throw new WorklistInputError('Tenant context is required');
    return tenantId;
  }
}
