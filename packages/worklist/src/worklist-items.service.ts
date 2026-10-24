import { selectItemListQuery, selectItemCountQuery, selectEventListQuery, selectEventCountQuery } from './filtered-reads.repository.js';
import { latestItemEvent, newItemEvents, allItemEvents, readWorkItem, eligibleWorkers } from './worklist.repository.js';
import { enqueueWorkItem, claimNextWorkItem, assignNextWorkItem, assignSelectedWorkItem, claimWorkItem, releaseWorkItem, completeWorkItem, cancelWorkItem, reassignWorkItem, forceReleaseWorkItem, forceCompleteWorkItem, forceReassignWorkItem, countItemEvents } from './item-commands.repository.js';
import { Inject, Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { Database, type Transaction } from '@stynx-nyx/data';
import { resolveWorklistDeadline } from './deadline.js';
import { WorklistConflictError, WorklistInputError, WorklistNotFoundError } from './errors.js';
import {
  mapCandidateRow,
  mapEventRow,
  mapItemRow,
  pageLimitOffset,
} from './row-utils.js';
import {
  WORKLIST_BUSINESS_CALENDAR,
  WORKLIST_CLOCK,
  WORKLIST_EVENT_SINK,
  type WorklistBusinessCalendar,
  type WorklistClock,
  type WorklistEventSink,
} from './ports.js';
import { mapWorklistSqlError } from './sql-errors.js';
import { WorklistStrategyRegistry } from './strategies.js';
import type {
  EnqueueWorkItemInput,
  WorklistCandidate,
  WorklistEvent,
  WorklistItemRecord,
  WorklistPage,
  WorklistSupervisorOverrideInput,
} from './types.js';
import {
  enqueueWorkItemSchema,
  eventListQuerySchema,
  itemListQuerySchema,
  parseWorklistInput,
  supervisorOverrideSchema,
} from './validation.js';
import { WorklistQueuesService } from './worklist-queues.service.js';

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
    const { dueAt, kind } = deadline!;

    try {
      const mutation = await this.database.tx(async (trx) => {
        const created = await trx.run(enqueueWorkItem,
          [
            value.queueCode,
            value.entityType,
            value.entityId,
            value.priority ?? null,
            dueAt,
            kind,
            deadline?.businessDays ?? null,
            deadline?.calendarKey ?? null,
            JSON.stringify(value.payload ?? {}),
            JSON.stringify(value.meta ?? {}),
          ],
        );
        const itemId = created[0]?.item_id;
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
    return this.claimingMutation((trx) => trx.run(claimNextWorkItem, [
      queueId,
      userId ?? null,
    ]));
  }

  async claim(itemId: string, userId?: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.run(claimWorkItem, [itemId, userId ?? null]),
    );
  }

  async assignNext(queueId: string): Promise<WorklistItemRecord | null> {
    const queue = await this.queues.get(queueId);
    if (queue.strategy === 'pull') {
      throw new WorklistConflictError('Pull queues distribute through claimNext', { queueId });
    }
    if (queue.strategy === 'round_robin' || queue.strategy === 'load_balanced') {
      return this.claimingMutation((trx) => trx.run(assignNextWorkItem, [queueId]));
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
    return this.claimingMutation((trx) => trx.run(assignSelectedWorkItem, [
      queueId,
      selected,
      queue.strategy,
    ]));
  }

  async release(itemId: string, reason?: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.run(releaseWorkItem, [itemId, reason ?? null]),
    );
  }

  async complete(
    itemId: string,
    note?: string,
    payload?: Record<string, unknown>,
  ): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.run(completeWorkItem, [
        itemId,
        note ?? null,
        JSON.stringify(payload ?? {}),
      ]),
    );
  }

  async cancel(itemId: string, reason: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.run(cancelWorkItem, [itemId, reason]),
    );
  }

  async reassign(itemId: string, toUserId: string, reason: string): Promise<WorklistItemRecord> {
    return this.itemMutation(itemId, (trx) =>
      trx.run(reassignWorkItem, [itemId, toUserId, reason]),
    );
  }

  async supervisorOverride(input: WorklistSupervisorOverrideInput): Promise<WorklistItemRecord> {
    const value = parseWorklistInput(supervisorOverrideSchema, input);
    if (value.operation === 'release') {
      return this.itemMutation(value.itemId, (trx) =>
        trx.run(forceReleaseWorkItem, [value.itemId, value.reason]),
      );
    }
    if (value.operation === 'complete') {
      return this.itemMutation(value.itemId, (trx) =>
        trx.run(forceCompleteWorkItem, [
          value.itemId,
          value.reason,
          JSON.stringify(value.payload ?? {}),
        ]),
      );
    }
    // superRefine already rejects missing targets before any transaction. Keep
    // the checked scalar stable in the asynchronous mutation callback.
    const toUserId = value.toUserId;
    if (toUserId === undefined) {
      throw new WorklistInputError('toUserId is required for reassign override');
    }
    return this.itemMutation(value.itemId, (trx) =>
      trx.run(forceReassignWorkItem, [
        value.itemId,
        toUserId,
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
    let mask = 0;
    const values: unknown[] = [];
    if (query.queueId) { mask |= 1; values.push(query.queueId); }
    if (query.status) { mask |= 2; values.push(query.status); }
    if (query.assigneeId) { mask |= 4; values.push(query.assigneeId); }
    if (query.entityType) { mask |= 8; values.push(query.entityType); }
    const listQuery = selectItemListQuery(mask);
    const countQuery = selectItemCountQuery(mask);
    if (!listQuery || !countQuery) throw new TypeError('Unknown worklist item filter mask');

    return this.database.tx(
      async (trx) => {
        const rows = await trx.run(listQuery, [...values, limit, offset]);
        const count = await trx.run(countQuery, values);
        return {
          data: rows.map(mapItemRow),
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

  async listEvents(input: unknown = {}): Promise<WorklistPage<WorklistEvent>> {
    const query = parseWorklistInput(eventListQuerySchema, input);
    const { limit, offset } = pageLimitOffset(query);
    let mask = 0;
    const values: unknown[] = [];
    if (query.itemId) { mask |= 1; values.push(query.itemId); }
    if (query.after) { mask |= 2; values.push(query.after); }
    if (query.afterId) { mask |= 4; values.push(query.afterId); }
    const listQuery = selectEventListQuery(mask);
    const countQuery = selectEventCountQuery(mask);
    if (!listQuery || !countQuery) throw new TypeError('Unknown worklist event filter mask');

    return this.database.tx(
      async (trx) => {
        const rows = await trx.run(listQuery, [...values, limit, offset]);
        const count = await trx.run(countQuery, values);
        return {
          data: rows.map(mapEventRow),
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

  private async claimingMutation(
    claim: (trx: Transaction) => Promise<readonly { item_id: string | null }[]>,
  ): Promise<WorklistItemRecord | null> {
    try {
      const mutation = await this.database.tx(async (trx) => {
        const result = await claim(trx);
        const itemId = result[0]?.item_id;
        if (!itemId) return null;
        const item = await this.getInTransaction(trx, itemId);
        const event = await trx.run(latestItemEvent,
          [itemId],
        );
        return {
          item,
          events: event.map(mapEventRow),
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
        const before = await trx.run(countItemEvents,
          [itemId],
        );
        await mutate(trx);
        const item = await this.getInTransaction(trx, itemId);
        const events = await trx.run(newItemEvents,
          [itemId, Number(before[0]?.total ?? 0)],
        );
        return { item, events: events.map(mapEventRow) };
      });
      await this.publish(mutation.events);
      return mutation.item;
    } catch (error) {
      throw mapWorklistSqlError(error);
    }
  }

  private async mutationResult(trx: Transaction, itemId: string): Promise<ItemMutationResult> {
    const item = await this.getInTransaction(trx, itemId);
    const events = await trx.run(allItemEvents,
      [itemId],
    );
    return { item, events: events.map(mapEventRow) };
  }

  private async getInTransaction(trx: Transaction, id: string): Promise<WorklistItemRecord> {
    const result = await trx.run(readWorkItem,
      [id],
    );
    const row = result[0];
    if (!row) throw new WorklistNotFoundError('item', id);
    return mapItemRow(row);
  }

  private async eligibleCandidates(queueId: string): Promise<WorklistCandidate[]> {
    const result = await this.database.tx(
      (trx) =>
        trx.run(eligibleWorkers,
          [queueId],
        ),
      { role: 'reader', readonly: true },
    );
    return result.map(mapCandidateRow);
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
