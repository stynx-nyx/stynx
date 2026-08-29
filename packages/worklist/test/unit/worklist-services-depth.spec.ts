import { resolveWorklistDeadline } from '../../src/deadline';
import {
  UnknownWorklistStrategyError,
  WorklistCalendarRequiredError,
  WorklistConflictError,
  WorklistForbiddenError,
  WorklistInputError,
  WorklistNotFoundError,
  WorklistSchedulerRequiredError,
  WorklistStrategyRegistrationError,
} from '../../src/errors';
import { NoopWorklistEventSink, SystemWorklistClock } from '../../src/ports';
import {
  EVENT_COLUMNS,
  ITEM_COLUMNS,
  QUEUE_COLUMNS,
  mapCandidateRow,
  mapEventRow,
  mapItemRow,
  mapQueueRow,
  mapWorkerStateRow,
  pageLimitOffset,
  requireObject,
} from '../../src/row-utils';
import { mapWorklistSqlError } from '../../src/sql-errors';
import {
  LoadBalancedWorklistStrategy,
  RoundRobinWorklistStrategy,
  WorklistStrategyRegistry,
} from '../../src/strategies';
import { WorklistItemsService } from '../../src/worklist-items.service';
import { WorklistQueuesService } from '../../src/worklist-queues.service';
import { WorklistSlaService } from '../../src/worklist-sla.service';
import { parseWorklistInput, pageQuerySchema } from '../../src/validation';

const uuid = '01978f4a-32bf-7c27-a131-fd73a9e101a1';
const otherUuid = '01978f4a-32bf-7c27-a131-fd73a9e101b2';
const now = new Date('2026-08-25T12:00:00.000Z');
const queueRow = {
  id: uuid,
  tenantId: uuid,
  code: 'review',
  name: 'Review',
  description: 'Queue',
  strategy: 'round_robin',
  strategyConfig: { stable: true },
  requiredPermission: 'work:claim:tenant',
  supervisorPermission: 'work:supervise:tenant',
  claimLimit: '5',
  defaultSlaSeconds: '60',
  defaultSlaBusinessDays: null,
  defaultCalendarKey: null,
  meta: { team: 'a' },
  createdBy: uuid,
  updatedBy: uuid,
  createdAt: now,
  updatedAt: now,
};
const workerRow = {
  id: uuid,
  tenantId: uuid,
  queueId: uuid,
  userId: otherUuid,
  available: true,
  weight: '2',
  lastAssignedAt: null,
  meta: {},
  createdBy: null,
  updatedBy: null,
  createdAt: now,
  updatedAt: now,
};
const itemRow = {
  id: uuid,
  tenantId: uuid,
  queueId: uuid,
  entityType: 'task',
  entityId: 'task-1',
  priority: '1',
  status: 'pending',
  assigneeId: null,
  claimedAt: null,
  deadlineKind: null,
  deadlineBusinessDays: null,
  deadlineCalendarKey: null,
  dueAt: null,
  breachDetectedAt: null,
  completedAt: null,
  completedBy: null,
  canceledAt: null,
  payload: { value: 1 },
  meta: {},
  createdBy: uuid,
  updatedBy: uuid,
  createdAt: now,
  updatedAt: now,
};
const eventRow = {
  id: uuid,
  eventId: uuid,
  tenantId: uuid,
  itemId: uuid,
  kind: 'enqueued',
  actorId: uuid,
  fromAssignee: null,
  toAssignee: null,
  reason: null,
  payload: {},
  createdAt: now,
};

function database(query: ReturnType<typeof vi.fn>) {
  return {
    tx: vi.fn(async (fn: (trx: { query: typeof query }) => Promise<unknown>) => fn({ query })),
  };
}

function observedDatabase(query: ReturnType<typeof vi.fn>) {
  const tx = vi.fn(
    async (
      operation: (trx: { query: typeof query }) => Promise<unknown>,
      _options?: { role: string; readonly: boolean },
    ) => operation({ query }),
  );
  return { database: { tx } as never, tx };
}

function capture(operation: () => unknown): unknown {
  try {
    return operation();
  } catch (error) {
    return error;
  }
}

describe('worklist row, error, clock, and deadline behavior', () => {
  it('maps every row shape, nullability, page math, and input object guard', () => {
    expect(mapQueueRow(queueRow)).toMatchObject({
      defaultDeadline: { kind: 'elapsed', seconds: 60 },
    });
    expect(
      mapQueueRow({
        ...queueRow,
        defaultSlaSeconds: null,
        defaultSlaBusinessDays: '3',
        defaultCalendarKey: 'br',
      }),
    ).toMatchObject({
      defaultDeadline: { kind: 'business_days', businessDays: 3, calendarKey: 'br' },
    });
    expect(
      mapQueueRow({
        ...queueRow,
        defaultSlaSeconds: null,
        defaultSlaBusinessDays: '3',
        defaultCalendarKey: null,
      }),
    ).toMatchObject({ defaultDeadline: { kind: 'business_days', businessDays: 3 } });
    expect(
      mapQueueRow({
        ...queueRow,
        defaultSlaSeconds: null,
        defaultSlaBusinessDays: null,
        description: null,
        strategyConfig: [],
        meta: null,
      }),
    ).toMatchObject({ defaultDeadline: null, description: null, strategyConfig: {}, meta: {} });
    expect(mapWorkerStateRow(workerRow)).toMatchObject({ weight: 2, lastAssignedAt: null });
    expect(mapItemRow(itemRow)).toMatchObject({ id: uuid, payload: { value: 1 } });
    expect(mapEventRow({ ...eventRow, id: undefined })).toMatchObject({ id: uuid });
    expect(
      mapCandidateRow({
        userId: uuid,
        available: 1,
        weight: '2',
        lastAssignedAt: now,
        openItemCount: '3',
      }),
    ).toEqual({ userId: uuid, available: true, weight: 2, lastAssignedAt: now, openItemCount: 3 });
    expect(pageLimitOffset({ page: 3, pageSize: 20 })).toEqual({ limit: 20, offset: 40 });
    expect(requireObject({ value: 1 })).toEqual({ value: 1 });
    for (const invalid of [null, [], 'bad'])
      expect(() => requireObject(invalid)).toThrow(WorklistInputError);
    expect(() => mapItemRow({ ...itemRow, createdAt: 'not-a-date' })).toThrow('Invalid createdAt');
  });

  it('maps all governed SQL errors and preserves unknown failures', () => {
    expect(mapWorklistSqlError({ code: 'WK400', message: 'bad', constraint: 'c' })).toBeInstanceOf(
      WorklistInputError,
    );
    expect(mapWorklistSqlError({ code: '23503' })).toBeInstanceOf(WorklistInputError);
    expect(mapWorklistSqlError({ code: '23514' })).toBeInstanceOf(WorklistInputError);
    expect(mapWorklistSqlError({ code: 'WK403' })).toBeInstanceOf(WorklistForbiddenError);
    expect(mapWorklistSqlError({ code: 'WK404', message: 'queue missing' })).toMatchObject({
      context: { entity: 'queue' },
    });
    expect(mapWorklistSqlError({ code: 'WK404', message: 'missing' })).toMatchObject({
      context: { entity: 'item' },
    });
    expect(mapWorklistSqlError({ code: 'WK409' })).toBeInstanceOf(WorklistConflictError);
    expect(mapWorklistSqlError({ code: '23505' })).toBeInstanceOf(WorklistConflictError);
    const unknown = new Error('unknown');
    expect(mapWorklistSqlError(unknown)).toBe(unknown);
  });

  it('constructs all stable error classes and executes default ports', async () => {
    expect(new WorklistNotFoundError('item', uuid)).toMatchObject({ status: 404 });
    expect(new WorklistConflictError('conflict')).toMatchObject({ status: 409 });
    expect(new WorklistInputError('input')).toMatchObject({ status: 400 });
    expect(new WorklistForbiddenError('forbidden')).toMatchObject({ status: 403 });
    expect(new UnknownWorklistStrategyError('x')).toMatchObject({ status: 400 });
    expect(new WorklistStrategyRegistrationError('bad', 'x')).toMatchObject({ status: 500 });
    expect(new WorklistCalendarRequiredError()).toMatchObject({ status: 500 });
    expect(new WorklistSchedulerRequiredError()).toMatchObject({ status: 500 });
    expect(new SystemWorklistClock().now()).toBeInstanceOf(Date);
    await expect(new NoopWorklistEventSink().publish(mapEventRow(eventRow))).resolves.toEqual(
      undefined,
    );
  });

  it('covers invalid and default business-day deadline paths', async () => {
    await expect(
      resolveWorklistDeadline({
        tenantId: uuid,
        now,
        deadline: { kind: 'absolute', dueAt: 'bad' },
      }),
    ).rejects.toThrow('valid date');
    const calendar = { addBusinessDays: vi.fn(async () => new Date('2026-08-26T12:00:00.000Z')) };
    await expect(
      resolveWorklistDeadline({
        tenantId: uuid,
        now,
        queueDefault: { kind: 'business_days', businessDays: 1 },
        calendar,
      }),
    ).resolves.toMatchObject({ calendarKey: null, businessDays: 1 });
    expect(calendar.addBusinessDays).toHaveBeenCalledWith({
      tenantId: uuid,
      startAt: now,
      businessDays: 1,
    });
    await resolveWorklistDeadline({
      tenantId: uuid,
      now,
      queueDefault: { kind: 'business_days', businessDays: 1, calendarKey: 'br' },
      calendar,
    });
    await expect(
      resolveWorklistDeadline({
        tenantId: uuid,
        now,
        deadline: { kind: 'business_days', businessDays: 1 },
        calendar: { addBusinessDays: async () => new Date('2026-08-24T12:00:00.000Z') },
      }),
    ).rejects.toThrow('before its start');
    await expect(
      resolveWorklistDeadline({
        tenantId: uuid,
        now,
        deadline: { kind: 'business_days', businessDays: 1 },
        calendar: { addBusinessDays: async () => new Date('bad') },
      }),
    ).rejects.toThrow('valid date');
  });

  it('covers strategy empty sets and deterministic tie breakers', async () => {
    const candidates = [
      { userId: otherUuid, available: true, weight: 1, lastAssignedAt: null, openItemCount: 1 },
      { userId: uuid, available: true, weight: 1, lastAssignedAt: null, openItemCount: 1 },
    ];
    await expect(
      new RoundRobinWorklistStrategy().select({ queueId: uuid, candidates }),
    ).resolves.toBe(uuid);
    await expect(
      new LoadBalancedWorklistStrategy().select({ queueId: uuid, candidates }),
    ).resolves.toBe(uuid);
    const dated = candidates.map((candidate, index) => ({
      ...candidate,
      lastAssignedAt: new Date(now.getTime() + index),
    }));
    await new RoundRobinWorklistStrategy().select({ queueId: uuid, candidates: dated });
    await new LoadBalancedWorklistStrategy().select({ queueId: uuid, candidates: dated });
    await expect(
      new RoundRobinWorklistStrategy().select({ queueId: uuid, candidates: [] }),
    ).resolves.toEqual(null);
    await expect(
      new LoadBalancedWorklistStrategy().select({ queueId: uuid, candidates: [] }),
    ).resolves.toEqual(null);
    expect(() => new WorklistStrategyRegistry().require('missing')).toThrow(
      UnknownWorklistStrategyError,
    );
    expect(() => parseWorklistInput(pageQuerySchema, { page: 0 })).toThrow(WorklistInputError);
  });
});

describe('WorklistQueuesService', () => {
  it('creates elapsed, business-day, and default queues and maps SQL failures', async () => {
    for (const defaultDeadline of [
      { kind: 'elapsed' as const, seconds: 60 },
      { kind: 'business_days' as const, businessDays: 2, calendarKey: 'br' },
      { kind: 'business_days' as const, businessDays: 2 },
      undefined,
    ]) {
      const query = vi.fn(async () => ({ rows: [queueRow] }));
      const service = new WorklistQueuesService(database(query) as never);
      await service.create({
        code: 'review',
        name: 'Review',
        requiredPermission: 'work:claim:tenant',
        supervisorPermission: 'work:supervise:tenant',
        ...(defaultDeadline ? { defaultDeadline } : {}),
      });
      expect(query).toHaveBeenCalledOnce();
    }
    const failure = { code: '23505' };
    await expect(
      new WorklistQueuesService(
        database(
          vi.fn(async () => {
            throw failure;
          }),
        ) as never,
      ).create({
        code: 'review',
        name: 'Review',
        requiredPermission: 'work:claim:tenant',
        supervisorPermission: 'work:supervise:tenant',
      }),
    ).rejects.toBeInstanceOf(WorklistConflictError);
    await expect(
      new WorklistQueuesService(database(vi.fn(async () => ({ rows: [] }))) as never).create({
        code: 'review',
        name: 'Review',
        requiredPermission: 'work:claim:tenant',
        supervisorPermission: 'work:supervise:tenant',
      }),
    ).rejects.toBeInstanceOf(WorklistInputError);
  });

  it('updates every mutable queue field and fails when absent', async () => {
    const query = vi.fn(async () => ({ rows: [queueRow] }));
    const service = new WorklistQueuesService(database(query) as never);
    await service.update(uuid, {
      name: 'Changed',
      description: null,
      strategy: 'custom',
      strategyConfig: { a: 1 },
      requiredPermission: 'work:read:tenant',
      supervisorPermission: 'work:admin:tenant',
      claimLimit: null,
      meta: { b: 2 },
      defaultDeadline: { kind: 'business_days', businessDays: 2 },
    });
    await service.update(uuid, { defaultDeadline: { kind: 'elapsed', seconds: 5 } });
    await service.update(uuid, { defaultDeadline: null });
    await expect(
      new WorklistQueuesService(database(vi.fn(async () => ({ rows: [] }))) as never).update(
        uuid,
        {},
      ),
    ).rejects.toBeInstanceOf(WorklistNotFoundError);
  });

  it('gets by id/code, lists with present/absent totals, and sets worker defaults', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [queueRow] })
      .mockResolvedValueOnce({ rows: [queueRow] })
      .mockResolvedValueOnce({ rows: [queueRow] })
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const service = new WorklistQueuesService(database(query) as never);
    await expect(service.get(uuid)).resolves.toMatchObject({ id: uuid });
    await expect(service.getByCode('review')).resolves.toMatchObject({ code: 'review' });
    await expect(service.list({ page: 1, pageSize: 10 })).resolves.toMatchObject({
      meta: { total: 1 },
    });
    await expect(service.list()).resolves.toMatchObject({ meta: { total: 0 } });
    for (const method of ['get', 'getByCode'] as const) {
      await expect(
        new WorklistQueuesService(database(vi.fn(async () => ({ rows: [] }))) as never)[method](
          uuid,
        ),
      ).rejects.toBeInstanceOf(WorklistNotFoundError);
    }

    const workerQuery = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [workerRow] });
    await expect(
      new WorklistQueuesService(database(workerQuery) as never).setWorkerState(uuid, {
        userId: otherUuid,
        available: true,
      }),
    ).resolves.toMatchObject({ userId: otherUuid, weight: 2 });
    await expect(
      new WorklistQueuesService(
        database(
          vi.fn(async () => {
            throw { code: 'WK403' };
          }),
        ) as never,
      ).setWorkerState(uuid, { userId: otherUuid, available: true }),
    ).rejects.toBeInstanceOf(WorklistForbiddenError);
    const emptyWorker = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await expect(
      new WorklistQueuesService(database(emptyWorker) as never).setWorkerState(uuid, {
        userId: otherUuid,
        available: true,
      }),
    ).rejects.toBeInstanceOf(WorklistInputError);
  });
});

describe('WorklistItemsService', () => {
  function itemsHarness(
    query: ReturnType<typeof vi.fn>,
    queueOverrides: Record<string, unknown> = {},
    tenant: string | undefined = uuid,
    strategy = new WorklistStrategyRegistry(),
  ) {
    const eventSink = { publish: vi.fn(async () => undefined) };
    const queues = {
      getByCode: vi.fn(async () => ({ ...mapQueueRow(queueRow), ...queueOverrides })),
      get: vi.fn(async () => ({ ...mapQueueRow(queueRow), ...queueOverrides })),
    };
    return {
      eventSink,
      queues,
      service: new WorklistItemsService(
        database(query) as never,
        { tenantId: tenant } as never,
        queues as never,
        strategy,
        null,
        { now: () => now },
        eventSink,
      ),
    };
  }

  const mutationQuery = () =>
    vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return { rows: [{ total: '0' }] };
      if (sql.includes('item_enqueue') || sql.includes('claim_next') || sql.includes('assign_next'))
        return { rows: [{ item_id: uuid }] };
      if (sql.includes('from worklist.items')) return { rows: [itemRow] };
      if (sql.includes('item_events')) return { rows: [eventRow] };
      return { rows: [] };
    });

  it('enqueues and publishes, rejects absent tenant/item ids, and maps SQL errors', async () => {
    const success = itemsHarness(mutationQuery());
    await expect(
      success.service.enqueue({ queueCode: 'review', entityType: 'task', entityId: 'task-1' }),
    ).resolves.toMatchObject({ id: uuid });
    await expect(
      success.service.enqueue({
        queueCode: 'review',
        entityType: 'task',
        entityId: 'task-2',
        priority: 3,
        deadline: { kind: 'absolute', dueAt: '2026-08-26T12:00:00.000Z' },
        payload: { a: 1 },
        meta: { b: 2 },
      }),
    ).resolves.toMatchObject({ id: uuid });
    expect(success.eventSink.publish).toHaveBeenCalledWith(mapEventRow(eventRow));
    await expect(
      itemsHarness(mutationQuery(), {}, null as never).service.enqueue({
        queueCode: 'review',
        entityType: 'task',
        entityId: 'task-1',
      }),
    ).rejects.toBeInstanceOf(WorklistInputError);
    const noId = vi.fn(async (sql: string) =>
      sql.includes('item_enqueue') ? { rows: [] } : { rows: [] },
    );
    await expect(
      itemsHarness(noId).service.enqueue({
        queueCode: 'review',
        entityType: 'task',
        entityId: 'task-1',
      }),
    ).rejects.toBeInstanceOf(WorklistConflictError);
  });

  it('claims, releases, completes, cancels, reassigns, and applies every supervisor override', async () => {
    for (const invoke of [
      (service: WorklistItemsService) => service.claimNext(uuid),
      (service: WorklistItemsService) => service.claimNext(uuid, otherUuid),
      (service: WorklistItemsService) => service.claim(uuid),
      (service: WorklistItemsService) => service.claim(uuid, otherUuid),
      (service: WorklistItemsService) => service.release(uuid),
      (service: WorklistItemsService) => service.release(uuid, 'reason'),
      (service: WorklistItemsService) => service.complete(uuid),
      (service: WorklistItemsService) => service.complete(uuid, 'done', { ok: true }),
      (service: WorklistItemsService) => service.cancel(uuid, 'reason'),
      (service: WorklistItemsService) => service.reassign(uuid, otherUuid, 'reason'),
      (service: WorklistItemsService) =>
        service.supervisorOverride({ itemId: uuid, operation: 'release', reason: 'r' }),
      (service: WorklistItemsService) =>
        service.supervisorOverride({ itemId: uuid, operation: 'complete', reason: 'r' }),
      (service: WorklistItemsService) =>
        service.supervisorOverride({
          itemId: uuid,
          operation: 'complete',
          reason: 'r',
          payload: { ok: true },
        }),
      (service: WorklistItemsService) =>
        service.supervisorOverride({
          itemId: uuid,
          operation: 'reassign',
          reason: 'r',
          toUserId: otherUuid,
        }),
    ])
      await expect(invoke(itemsHarness(mutationQuery()).service)).resolves.toMatchObject({
        id: uuid,
      });

    const empty = vi.fn(async (sql: string) =>
      sql.includes('claim_next') ? { rows: [] } : { rows: [] },
    );
    await expect(itemsHarness(empty).service.claimNext(uuid)).resolves.toEqual(null);
    await expect(
      itemsHarness(
        vi.fn(async () => {
          throw { code: 'WK403' };
        }),
      ).service.claimNext(uuid),
    ).rejects.toBeInstanceOf(WorklistForbiddenError);
    await expect(
      itemsHarness(
        vi.fn(async () => {
          throw { code: 'WK403' };
        }),
      ).service.release(uuid),
    ).rejects.toBeInstanceOf(WorklistForbiddenError);
    const absentCount = vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return { rows: [] };
      if (sql.includes('from worklist.items')) return { rows: [itemRow] };
      if (sql.includes('item_events')) return { rows: [] };
      return { rows: [] };
    });
    await expect(itemsHarness(absentCount).service.release(uuid)).resolves.toMatchObject({
      id: uuid,
    });
  });

  it('assigns built-ins and valid custom workers, rejects pull/outside, and returns null selections', async () => {
    await expect(
      itemsHarness(mutationQuery(), { strategy: 'pull' }).service.assignNext(uuid),
    ).rejects.toBeInstanceOf(WorklistConflictError);
    for (const strategy of ['round_robin', 'load_balanced'])
      await expect(
        itemsHarness(mutationQuery(), { strategy }).service.assignNext(uuid),
      ).resolves.toMatchObject({ id: uuid });

    const eligible = vi.fn(async (sql: string) => {
      if (sql.includes('eligible_workers'))
        return {
          rows: [
            {
              userId: otherUuid,
              available: true,
              weight: 1,
              lastAssignedAt: null,
              openItemCount: 0,
            },
          ],
        };
      return mutationQuery()(sql);
    });
    const custom = { key: 'custom', select: vi.fn(async () => otherUuid) };
    await expect(
      itemsHarness(
        eligible,
        { strategy: 'custom' },
        uuid,
        new WorklistStrategyRegistry([custom]),
      ).service.assignNext(uuid),
    ).resolves.toMatchObject({ id: uuid });
    const none = { key: 'custom', select: vi.fn(async () => null) };
    await expect(
      itemsHarness(
        eligible,
        { strategy: 'custom' },
        uuid,
        new WorklistStrategyRegistry([none]),
      ).service.assignNext(uuid),
    ).resolves.toEqual(null);
    const outside = { key: 'custom', select: vi.fn(async () => uuid) };
    await expect(
      itemsHarness(
        eligible,
        { strategy: 'custom' },
        uuid,
        new WorklistStrategyRegistry([outside]),
      ).service.assignNext(uuid),
    ).rejects.toBeInstanceOf(WorklistInputError);
  });

  it('gets, lists filtered/unfiltered items and events, and rejects missing items', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return { rows: [{ total: '1' }] };
      if (sql.includes('item_events')) return { rows: [eventRow] };
      return { rows: [itemRow] };
    });
    const service = itemsHarness(query).service;
    await expect(service.get(uuid)).resolves.toMatchObject({ id: uuid });
    await expect(
      service.list({ queueId: uuid, status: 'pending', assigneeId: otherUuid, entityType: 'task' }),
    ).resolves.toMatchObject({ data: [expect.objectContaining({ id: uuid })], meta: { total: 1 } });
    await expect(service.list()).resolves.toMatchObject({ meta: { total: 1 } });
    await expect(
      service.listEvents({ itemId: uuid, after: now, afterId: uuid }),
    ).resolves.toMatchObject({ data: [expect.objectContaining({ id: uuid })] });
    await expect(service.listEvents()).resolves.toMatchObject({ meta: { total: 1 } });
    const absentTotals = vi.fn(async (sql: string) =>
      sql.includes('count(*)')
        ? { rows: [] }
        : sql.includes('item_events')
          ? { rows: [eventRow] }
          : { rows: [itemRow] },
    );
    await expect(itemsHarness(absentTotals).service.list()).resolves.toMatchObject({
      meta: { total: 0 },
    });
    await expect(itemsHarness(absentTotals).service.listEvents()).resolves.toMatchObject({
      meta: { total: 0 },
    });
    await expect(
      itemsHarness(vi.fn(async () => ({ rows: [] }))).service.get(uuid),
    ).rejects.toBeInstanceOf(WorklistNotFoundError);
  });
});

describe('WorklistSlaService', () => {
  it('detects, publishes, and validates breach limits and SQL errors', async () => {
    const sink = { publish: vi.fn(async () => undefined) };
    const query = vi.fn(async () => ({ rows: [eventRow] }));
    const service = new WorklistSlaService(
      database(query) as never,
      { tenantId: uuid } as never,
      null,
      sink,
    );
    await expect(service.detectBreaches()).resolves.toHaveLength(1);
    expect(sink.publish).toHaveBeenCalledWith(mapEventRow(eventRow));
    for (const limit of [0, 1001, 1.5])
      await expect(service.detectBreaches(limit)).rejects.toBeInstanceOf(WorklistInputError);
    await expect(
      new WorklistSlaService(
        database(
          vi.fn(async () => {
            throw { code: 'WK403' };
          }),
        ) as never,
        { tenantId: uuid } as never,
        null,
        sink,
      ).detectBreaches(),
    ).rejects.toBeInstanceOf(WorklistForbiddenError);
  });

  it('schedules using explicit/context tenants and rejects absent, mismatched, or absent adapters', async () => {
    const scheduler = { scheduleRecurring: vi.fn(async (input) => input) };
    const sink = { publish: vi.fn(async () => undefined) };
    const db = database(vi.fn(async () => ({ rows: [] }))) as never;
    const service = new WorklistSlaService(db, { tenantId: uuid } as never, scheduler, sink);
    await expect(service.scheduleBreachDetection({ intervalSeconds: 60 })).resolves.toMatchObject({
      tenantId: uuid,
    });
    await expect(
      service.scheduleBreachDetection({ tenantId: uuid, intervalSeconds: 60, limit: 5 }),
    ).resolves.toMatchObject({ payload: { limit: 5 } });
    await expect(
      new WorklistSlaService(
        db,
        { tenantId: undefined } as never,
        scheduler,
        sink,
      ).scheduleBreachDetection({ intervalSeconds: 60 }),
    ).rejects.toBeInstanceOf(WorklistInputError);
    await expect(
      service.scheduleBreachDetection({ tenantId: otherUuid, intervalSeconds: 60 }),
    ).rejects.toBeInstanceOf(WorklistInputError);
    await expect(
      new WorklistSlaService(db, { tenantId: uuid } as never, null, sink).scheduleBreachDetection({
        intervalSeconds: 60,
      }),
    ).rejects.toBeInstanceOf(WorklistSchedulerRequiredError);
  });
});

describe('D24.4 observable survivor boundaries', () => {
  it('preserves complete row projections and governed error metadata', () => {
    expect(mapQueueRow(queueRow)).toStrictEqual({
      id: uuid,
      tenantId: uuid,
      code: 'review',
      name: 'Review',
      description: 'Queue',
      strategy: 'round_robin',
      strategyConfig: { stable: true },
      requiredPermission: 'work:claim:tenant',
      supervisorPermission: 'work:supervise:tenant',
      claimLimit: 5,
      defaultDeadline: { kind: 'elapsed', seconds: 60 },
      meta: { team: 'a' },
      createdBy: uuid,
      updatedBy: uuid,
      createdAt: now,
      updatedAt: now,
    });
    expect(mapWorkerStateRow(workerRow)).toStrictEqual({
      id: uuid,
      tenantId: uuid,
      queueId: uuid,
      userId: otherUuid,
      available: true,
      weight: 2,
      lastAssignedAt: null,
      meta: {},
      createdBy: null,
      updatedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    expect(mapItemRow(itemRow)).toStrictEqual({
      id: uuid,
      tenantId: uuid,
      queueId: uuid,
      entityType: 'task',
      entityId: 'task-1',
      priority: 1,
      status: 'pending',
      assigneeId: null,
      claimedAt: null,
      deadlineKind: null,
      deadlineBusinessDays: null,
      deadlineCalendarKey: null,
      dueAt: null,
      breachDetectedAt: null,
      completedAt: null,
      completedBy: null,
      canceledAt: null,
      payload: { value: 1 },
      meta: {},
      createdBy: uuid,
      updatedBy: uuid,
      createdAt: now,
      updatedAt: now,
    });
    expect(mapEventRow(eventRow)).toStrictEqual({
      id: uuid,
      tenantId: uuid,
      itemId: uuid,
      kind: 'enqueued',
      actorId: uuid,
      fromAssignee: null,
      toAssignee: null,
      reason: null,
      payload: {},
      createdAt: now,
    });

    const cause = { code: 'WK409' };
    expect(new WorklistNotFoundError('queue', otherUuid)).toMatchObject({
      message: `Worklist queue not found: ${otherUuid}`,
      code: 'WORKLIST_NOT_FOUND',
      status: 404,
      context: { entity: 'queue', id: otherUuid },
    });
    expect(new WorklistConflictError('collision', { itemId: uuid }, cause)).toMatchObject({
      message: 'collision',
      code: 'WORKLIST_CONFLICT',
      status: 409,
      context: { itemId: uuid },
      cause,
    });
    expect(new WorklistInputError('invalid', { field: 'queue' }, cause)).toMatchObject({
      message: 'invalid',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
      context: { field: 'queue' },
      cause,
    });
    expect(new WorklistForbiddenError('denied', cause)).toMatchObject({
      message: 'denied',
      code: 'WORKLIST_FORBIDDEN',
      status: 403,
      cause,
    });
    expect(new UnknownWorklistStrategyError('geo')).toMatchObject({
      message: 'Unknown worklist strategy: geo',
      code: 'WORKLIST_STRATEGY_UNKNOWN',
      status: 400,
      context: { key: 'geo' },
    });
    expect(new WorklistStrategyRegistrationError('duplicate', 'geo')).toMatchObject({
      message: 'duplicate',
      code: 'WORKLIST_STRATEGY_REGISTRATION_INVALID',
      status: 500,
      context: { key: 'geo' },
    });
    expect(new WorklistCalendarRequiredError()).toMatchObject({
      message: 'A business calendar adapter is required for business-day deadlines',
      code: 'WORKLIST_BUSINESS_CALENDAR_REQUIRED',
      status: 500,
    });
    expect(new WorklistSchedulerRequiredError()).toMatchObject({
      message: 'A worklist scheduler adapter is required to schedule breach detection',
      code: 'WORKLIST_SCHEDULER_REQUIRED',
      status: 500,
    });

    expect(
      mapWorklistSqlError({ code: '23514', message: 'check', constraint: 'queue_check' }),
    ).toMatchObject({
      message: 'check',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
      context: { constraint: 'queue_check' },
    });
    expect(
      mapWorklistSqlError({ code: '23505', message: 'unique', constraint: 'queue_code' }),
    ).toMatchObject({
      message: 'unique',
      code: 'WORKLIST_CONFLICT',
      status: 409,
      context: { constraint: 'queue_code' },
    });
  });

  it('binds every queue write and read to exact SQL parameter projections', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('worker_state')) return { rows: [workerRow] };
      return { rows: [queueRow] };
    });
    const service = new WorklistQueuesService(database(query) as never);
    await service.create({
      code: 'review',
      name: 'Review',
      description: 'Governed queue',
      strategy: 'round_robin',
      strategyConfig: { stable: true },
      requiredPermission: 'work:claim:tenant',
      supervisorPermission: 'work:supervise:tenant',
      claimLimit: 7,
      defaultDeadline: { kind: 'business_days', businessDays: 4, calendarKey: 'br-sp' },
      meta: { team: 'legal' },
    });
    expect(query.mock.calls[0]?.[0]).toContain("current_setting('app.tenant_id')::uuid");
    expect(query.mock.calls[0]?.[0]).toContain('default_sla_business_days');
    expect(query.mock.calls[0]?.[1]).toStrictEqual([
      'review',
      'Review',
      'Governed queue',
      'round_robin',
      '{"stable":true}',
      'work:claim:tenant',
      'work:supervise:tenant',
      7,
      null,
      4,
      'br-sp',
      '{"team":"legal"}',
    ]);

    await service.update(uuid, {
      name: 'Changed',
      description: null,
      strategy: 'custom',
      strategyConfig: { lane: 2 },
      requiredPermission: 'work:read:tenant',
      supervisorPermission: 'work:admin:tenant',
      claimLimit: null,
      defaultDeadline: { kind: 'elapsed', seconds: 45 },
      meta: { changed: true },
    });
    expect(query.mock.calls[1]?.[0]).toContain('name = $2');
    expect(query.mock.calls[1]?.[0]).toContain('default_calendar_key = $12');
    expect(query.mock.calls[1]?.[0]).toContain(
      "updated_by = current_setting('app.actor_id')::uuid",
    );
    expect(query.mock.calls[1]?.[1]).toStrictEqual([
      uuid,
      'Changed',
      null,
      'custom',
      '{"lane":2}',
      'work:read:tenant',
      'work:admin:tenant',
      null,
      '{"changed":true}',
      45,
      null,
      null,
    ]);

    await service.get(uuid);
    await service.getByCode('review');
    expect(query.mock.calls[2]).toEqual([expect.stringContaining('where id = $1'), [uuid]]);
    expect(query.mock.calls[3]).toEqual([expect.stringContaining('where code = $1'), ['review']]);

    await service.setWorkerState(uuid, {
      userId: otherUuid,
      available: false,
      weight: 3,
      meta: { shift: 'night' },
    });
    expect(query.mock.calls[4]).toStrictEqual([
      'select worklist.assert_can_work($1, $2, true)',
      [uuid, otherUuid],
    ]);
    expect(query.mock.calls[5]?.[0]).toContain('on conflict (tenant_id, queue_id, user_id)');
    expect(query.mock.calls[5]?.[1]).toStrictEqual([
      uuid,
      otherUuid,
      false,
      3,
      '{"shift":"night"}',
    ]);
  });

  it('binds item mutation, filter, event, and strategy effects to exact public calls', async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return { rows: [{ total: '1' }] };
      if (sql.includes('item_enqueue') || sql.includes('claim_next') || sql.includes('assign_next'))
        return { rows: [{ item_id: uuid }] };
      if (sql.includes('eligible_workers'))
        return {
          rows: [
            {
              userId: otherUuid,
              available: true,
              weight: 2,
              lastAssignedAt: null,
              openItemCount: 0,
            },
          ],
        };
      if (sql.includes('from worklist.items')) return { rows: [itemRow] };
      if (sql.includes('item_events')) return { rows: [eventRow] };
      return { rows: [] };
    });
    const eventSink = { publish: vi.fn(async () => undefined) };
    const queues = {
      getByCode: vi.fn(async () => ({ ...mapQueueRow(queueRow), defaultDeadline: null })),
      get: vi.fn(async () => ({
        ...mapQueueRow(queueRow),
        strategy: 'custom',
        strategyConfig: { lane: 'appeals' },
      })),
    };
    const custom = { key: 'custom', select: vi.fn(async () => otherUuid) };
    const service = new WorklistItemsService(
      database(query) as never,
      { tenantId: uuid } as never,
      queues as never,
      new WorklistStrategyRegistry([custom]),
      null,
      { now: () => now },
      eventSink,
    );

    await service.enqueue({
      queueCode: 'review',
      entityType: 'appeal',
      entityId: 'appeal-7',
      priority: 4,
      deadline: { kind: 'absolute', dueAt: '2026-08-26T12:00:00.000Z' },
      payload: { stage: 2 },
      meta: { source: 'portal' },
    });
    const enqueueCall = query.mock.calls.find(([sql]) => sql.includes('item_enqueue'));
    expect(enqueueCall?.[1]).toStrictEqual([
      'review',
      'appeal',
      'appeal-7',
      4,
      new Date('2026-08-26T12:00:00.000Z'),
      'absolute',
      null,
      null,
      '{"stage":2}',
      '{"source":"portal"}',
    ]);

    await service.claimNext(uuid, otherUuid);
    await service.release(uuid, 'return');
    await service.complete(uuid, 'done', { result: 'approved' });
    await service.cancel(uuid, 'withdrawn');
    await service.reassign(uuid, otherUuid, 'specialist');
    await service.supervisorOverride({
      itemId: uuid,
      operation: 'complete',
      reason: 'supervised',
      payload: { override: true },
    });
    await service.assignNext(uuid);

    const calls = query.mock.calls.map(([sql, values]) => [String(sql), values] as const);
    expect(calls).toContainEqual([
      'select worklist.item_claim_next($1, $2) as item_id',
      [uuid, otherUuid],
    ]);
    expect(calls).toContainEqual(['select worklist.item_release($1, $2, false)', [uuid, 'return']]);
    expect(calls).toContainEqual([
      'select worklist.item_complete($1, $2, $3::jsonb, false)',
      [uuid, 'done', '{"result":"approved"}'],
    ]);
    expect(calls).toContainEqual(['select worklist.item_cancel($1, $2)', [uuid, 'withdrawn']]);
    expect(calls).toContainEqual([
      'select worklist.item_reassign($1, $2, $3, false)',
      [uuid, otherUuid, 'specialist'],
    ]);
    expect(calls).toContainEqual([
      'select worklist.item_complete($1, $2, $3::jsonb, true)',
      [uuid, 'supervised', '{"override":true}'],
    ]);
    expect(calls).toContainEqual([
      'select worklist.item_assign_next($1, $2, $3) as item_id',
      [uuid, otherUuid, 'custom'],
    ]);
    expect(custom.select).toHaveBeenCalledWith({
      queueId: uuid,
      candidates: [
        {
          userId: otherUuid,
          available: true,
          weight: 2,
          lastAssignedAt: null,
          openItemCount: 0,
        },
      ],
      strategyConfig: { lane: 'appeals' },
    });
    expect(eventSink.publish).toHaveBeenCalled();

    await service.list({
      page: 2,
      pageSize: 25,
      queueId: uuid,
      status: 'pending',
      assigneeId: otherUuid,
      entityType: 'appeal',
    });
    const itemListCall = query.mock.calls.find(([sql]) =>
      sql.includes('order by priority, due_at asc nulls last'),
    );
    expect(itemListCall?.[0]).toContain(
      'where queue_id = $1 and status = $2::worklist.item_status and assignee_id = $3 and entity_type = $4',
    );
    expect(itemListCall?.[1]).toStrictEqual([uuid, 'pending', otherUuid, 'appeal', 25, 25]);

    await service.listEvents({
      page: 2,
      pageSize: 10,
      itemId: uuid,
      after: now,
      afterId: otherUuid,
    });
    const eventListCall = query.mock.calls.find(([sql]) =>
      sql.includes('order by created_at, id limit $4 offset $5'),
    );
    expect(eventListCall?.[0]).toContain('where item_id = $1 and created_at > $2 and id > $3');
    expect(eventListCall?.[1]).toStrictEqual([uuid, now, otherUuid, 10, 10]);
  });

  it('exposes SLA query, publication, and scheduler payloads exactly', async () => {
    const query = vi.fn(async () => ({ rows: [eventRow] }));
    const sink = { publish: vi.fn(async () => undefined) };
    const scheduler = { scheduleRecurring: vi.fn(async (value) => value) };
    const service = new WorklistSlaService(
      database(query) as never,
      { tenantId: uuid } as never,
      scheduler,
      sink,
    );
    await expect(service.detectBreaches(37)).resolves.toStrictEqual([mapEventRow(eventRow)]);
    expect(query.mock.calls[0]?.[0]).toContain('from worklist.detect_breaches($1)');
    expect(query.mock.calls[0]?.[1]).toStrictEqual([37]);
    expect(sink.publish).toHaveBeenCalledTimes(1);
    expect(sink.publish).toHaveBeenCalledWith(mapEventRow(eventRow));

    await expect(
      service.scheduleBreachDetection({ tenantId: uuid, intervalSeconds: 45, limit: 37 }),
    ).resolves.toStrictEqual({
      key: `stynx.worklist.detect-breaches:${uuid}`,
      tenantId: uuid,
      jobType: 'stynx.worklist.detect-breaches',
      intervalSeconds: 45,
      payload: { tenantId: uuid, limit: 37 },
    });
    expect(scheduler.scheduleRecurring).toHaveBeenCalledOnce();
  });
});

describe('D24.10 exact survivor projections', () => {
  it('binds every surviving row date failure to its exact public field message', () => {
    const failures = [
      capture(() => mapQueueRow({ ...queueRow, createdAt: 'invalid' })),
      capture(() => mapQueueRow({ ...queueRow, updatedAt: 'invalid' })),
      capture(() => mapWorkerStateRow({ ...workerRow, createdAt: 'invalid' })),
      capture(() => mapWorkerStateRow({ ...workerRow, updatedAt: 'invalid' })),
      capture(() => mapItemRow({ ...itemRow, updatedAt: 'invalid' })),
      capture(() => mapEventRow({ ...eventRow, createdAt: 'invalid' })),
    ];
    expect(
      failures.map((error) => [
        (error as WorklistInputError).message,
        (error as WorklistInputError).code,
        (error as WorklistInputError).status,
      ]),
    ).toStrictEqual([
      ['Invalid createdAt value returned by database', 'WORKLIST_INPUT_INVALID', 400],
      ['Invalid updatedAt value returned by database', 'WORKLIST_INPUT_INVALID', 400],
      ['Invalid createdAt value returned by database', 'WORKLIST_INPUT_INVALID', 400],
      ['Invalid updatedAt value returned by database', 'WORKLIST_INPUT_INVALID', 400],
      ['Invalid updatedAt value returned by database', 'WORKLIST_INPUT_INVALID', 400],
      ['Invalid createdAt value returned by database', 'WORKLIST_INPUT_INVALID', 400],
    ]);
  });

  it('keeps object fallbacks, undefined nullability, and claimed-date failure exact', () => {
    expect(mapQueueRow({ ...queueRow, meta: null }).meta).toStrictEqual({});
    expect(mapQueueRow({ ...queueRow, meta: 'invalid' }).meta).toStrictEqual({});
    expect(
      mapQueueRow({
        ...queueRow,
        description: undefined,
        claimLimit: undefined,
        strategyConfig: [],
        meta: 'invalid',
      }),
    ).toMatchObject({ description: null, claimLimit: null, strategyConfig: {}, meta: {} });
    expect(mapWorkerStateRow({ ...workerRow, lastAssignedAt: undefined, meta: [] })).toMatchObject({
      lastAssignedAt: null,
      meta: {},
    });
    expect(
      mapItemRow({ ...itemRow, claimedAt: undefined, payload: [], meta: 'invalid' }),
    ).toMatchObject({
      claimedAt: null,
      payload: {},
      meta: {},
    });
    expect(mapEventRow({ ...eventRow, payload: [] }).payload).toStrictEqual({});
    const claimedAt = capture(() => mapItemRow({ ...itemRow, claimedAt: 'invalid' }));
    expect([
      (claimedAt as WorklistInputError).message,
      (claimedAt as WorklistInputError).code,
      (claimedAt as WorklistInputError).status,
    ]).toStrictEqual(['Invalid date value returned by database', 'WORKLIST_INPUT_INVALID', 400]);
    const objectError = capture(() => requireObject([]));
    expect([
      (objectError as WorklistInputError).message,
      (objectError as WorklistInputError).code,
      (objectError as WorklistInputError).status,
    ]).toStrictEqual(['Input must be an object', 'WORKLIST_INPUT_INVALID', 400]);
  });

  it('maps WK400 and WK404 defaults to exact stable error projections', () => {
    const input = mapWorklistSqlError({ code: 'WK400' }) as WorklistInputError;
    expect([input.message, input.code, input.status, input.context]).toStrictEqual([
      'Worklist database operation failed',
      'WORKLIST_INPUT_INVALID',
      400,
      { constraint: undefined },
    ]);
    const missing = mapWorklistSqlError({ code: 'WK404' }) as WorklistNotFoundError;
    expect([missing.message, missing.code, missing.status, missing.context]).toStrictEqual([
      'Worklist item not found: unknown',
      'WORKLIST_NOT_FOUND',
      404,
      { entity: 'item', id: 'unknown' },
    ]);
  });

  it('accepts both breach limits and rejects zero with the exact public message', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const observed = observedDatabase(query);
    const service = new WorklistSlaService(observed.database, { tenantId: uuid } as never, null, {
      publish: vi.fn(async () => undefined),
    });
    await expect(service.detectBreaches(1)).resolves.toStrictEqual([]);
    await expect(service.detectBreaches(1000)).resolves.toStrictEqual([]);
    expect(query.mock.calls.map((call) => call[1])).toStrictEqual([[1], [1000]]);
    await expect(service.detectBreaches(0)).rejects.toMatchObject({
      message: 'Breach detection limit must be between 1 and 1000',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
  });

  it('reports both scheduler tenant failures with exact messages', async () => {
    const scheduler = { scheduleRecurring: vi.fn(async (value) => value) };
    const db = observedDatabase(vi.fn(async () => ({ rows: [] }))).database;
    const sink = { publish: vi.fn(async () => undefined) };
    await expect(
      new WorklistSlaService(
        db,
        { tenantId: undefined } as never,
        scheduler,
        sink,
      ).scheduleBreachDetection({ intervalSeconds: 30 }),
    ).rejects.toMatchObject({
      message: 'Tenant context or tenantId is required',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
    await expect(
      new WorklistSlaService(
        db,
        { tenantId: uuid } as never,
        scheduler,
        sink,
      ).scheduleBreachDetection({
        tenantId: otherUuid,
        intervalSeconds: 30,
      }),
    ).rejects.toMatchObject({
      message: 'Scheduled tenant does not match active tenant context',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
  });

  it('projects empty and full queue updates to exact SQL and parameters', async () => {
    const emptyQuery = vi.fn(async () => ({ rows: [queueRow] }));
    await new WorklistQueuesService(observedDatabase(emptyQuery).database).update(uuid, {});
    expect(emptyQuery.mock.calls[0]).toStrictEqual([
      `update worklist.queues set strategy = $2, updated_at = clock_timestamp(), updated_by = current_setting('app.actor_id')::uuid where id = $1 returning ${QUEUE_COLUMNS}`,
      [uuid, 'pull'],
    ]);

    const fullQuery = vi.fn(async () => ({ rows: [queueRow] }));
    await new WorklistQueuesService(observedDatabase(fullQuery).database).update(uuid, {
      name: 'Exact queue',
      description: null,
      strategy: 'custom_v4',
      strategyConfig: { lane: 4 },
      requiredPermission: 'work:read:tenant',
      supervisorPermission: 'work:admin:tenant',
      claimLimit: 9,
      meta: { owner: 'ops' },
      defaultDeadline: { kind: 'business_days', businessDays: 7, calendarKey: 'state-sp' },
    });
    expect(fullQuery.mock.calls[0]).toStrictEqual([
      `update worklist.queues set name = $2, description = $3, strategy = $4, strategy_config = $5::jsonb, required_permission = $6, supervisor_permission = $7, claim_limit = $8, meta = $9::jsonb, default_sla_seconds = $10, default_sla_business_days = $11, default_calendar_key = $12, updated_at = clock_timestamp(), updated_by = current_setting('app.actor_id')::uuid where id = $1 returning ${QUEUE_COLUMNS}`,
      [
        uuid,
        'Exact queue',
        null,
        'custom_v4',
        '{"lane":4}',
        'work:read:tenant',
        'work:admin:tenant',
        9,
        '{"owner":"ops"}',
        null,
        7,
        'state-sp',
      ],
    ]);
  });

  it('retains reader transaction options and exact queue read queries', async () => {
    const query = vi.fn(async (sql: string) =>
      sql.includes('count(*)') ? { rows: [{ total: '1' }] } : { rows: [queueRow] },
    );
    const observed = observedDatabase(query);
    const service = new WorklistQueuesService(observed.database);
    await service.get(uuid);
    await service.getByCode('review');
    await service.list({ page: 2, pageSize: 25 });
    expect(observed.tx.mock.calls.map((call) => call[1])).toStrictEqual([
      { role: 'reader', readonly: true },
      { role: 'reader', readonly: true },
      { role: 'reader', readonly: true },
    ]);
    expect(query.mock.calls).toStrictEqual([
      [`select ${QUEUE_COLUMNS} from worklist.queues where id = $1`, [uuid]],
      [`select ${QUEUE_COLUMNS} from worklist.queues where code = $1`, ['review']],
      [
        `select ${QUEUE_COLUMNS} from worklist.queues order by code, id limit $1 offset $2`,
        [25, 25],
      ],
      ['select count(*)::text as total from worklist.queues'],
    ]);
  });

  function directItemsHarness(
    query: ReturnType<typeof vi.fn>,
    queueOverrides: Record<string, unknown> = {},
    tenant: string | undefined = uuid,
    strategy = new WorklistStrategyRegistry(),
    calendar: { addBusinessDays: ReturnType<typeof vi.fn> } | null = null,
  ) {
    const observed = observedDatabase(query);
    const eventSink = { publish: vi.fn(async () => undefined) };
    const queues = {
      getByCode: vi.fn(async () => ({ ...mapQueueRow(queueRow), ...queueOverrides })),
      get: vi.fn(async () => ({ ...mapQueueRow(queueRow), ...queueOverrides })),
    };
    return {
      eventSink,
      observed,
      queues,
      service: new WorklistItemsService(
        observed.database,
        { tenantId: tenant } as never,
        queues as never,
        strategy,
        calendar as never,
        { now: () => now },
        eventSink,
      ),
    };
  }

  function exactMutationQuery() {
    return vi.fn(async (sql: string) => {
      if (sql.includes('count(*)')) return { rows: [{ total: '1' }] };
      if (sql.includes('item_enqueue') || sql.includes('claim_next') || sql.includes('assign_next'))
        return { rows: [{ item_id: uuid }] };
      if (sql.includes('from worklist.items')) return { rows: [itemRow] };
      if (sql.includes('item_events')) return { rows: [eventRow] };
      return { rows: [] };
    });
  }

  it('projects business-day enqueue and event lookup with exact parameters', async () => {
    const query = exactMutationQuery();
    const dueAt = new Date('2026-08-28T12:00:00.000Z');
    const addBusinessDays = vi.fn(async () => dueAt);
    const harness = directItemsHarness(
      query,
      { defaultDeadline: { kind: 'business_days', businessDays: 3, calendarKey: 'state-sp' } },
      uuid,
      new WorklistStrategyRegistry(),
      { addBusinessDays },
    );
    await harness.service.enqueue({ queueCode: 'review', entityType: 'task', entityId: 'task-10' });
    expect(addBusinessDays).toHaveBeenCalledWith({
      tenantId: uuid,
      calendarKey: 'state-sp',
      startAt: now,
      businessDays: 3,
    });
    expect(query.mock.calls.find(([sql]) => sql.includes('item_enqueue'))?.[1]).toStrictEqual([
      'review',
      'task',
      'task-10',
      null,
      dueAt,
      'business_days',
      3,
      'state-sp',
      '{}',
      '{}',
    ]);
    expect(query.mock.calls.find(([sql]) => sql.includes('order by created_at, id'))).toStrictEqual(
      [
        `select ${EVENT_COLUMNS} from worklist.item_events where item_id = $1 order by created_at, id`,
        [uuid],
      ],
    );
    expect(harness.eventSink.publish).toHaveBeenCalledWith(mapEventRow(eventRow));
  });

  it('reports enqueue and tenant failures with exact public messages', async () => {
    const empty = vi.fn(async (sql: string) =>
      sql.includes('item_enqueue') ? { rows: [] } : { rows: [itemRow] },
    );
    await expect(
      directItemsHarness(empty).service.enqueue({
        queueCode: 'review',
        entityType: 'task',
        entityId: 'task-empty',
      }),
    ).rejects.toMatchObject({
      message: 'Worklist enqueue returned no item',
      code: 'WORKLIST_CONFLICT',
      status: 409,
    });
    await expect(
      directItemsHarness(exactMutationQuery(), {}, null as never).service.enqueue({
        queueCode: 'review',
        entityType: 'task',
        entityId: 'task-tenant',
      }),
    ).rejects.toMatchObject({
      message: 'Tenant context is required',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
  });

  it('binds pull, built-in, and custom assignment decisions exactly', async () => {
    await expect(
      directItemsHarness(exactMutationQuery(), { strategy: 'pull' }).service.assignNext(uuid),
    ).rejects.toMatchObject({
      message: 'Pull queues distribute through claimNext',
      context: { queueId: uuid },
    });

    const builtInQuery = exactMutationQuery();
    await directItemsHarness(builtInQuery, { strategy: 'round_robin' }).service.assignNext(uuid);
    expect(builtInQuery.mock.calls[0]).toStrictEqual([
      'select worklist.assign_next($1) as item_id',
      [uuid],
    ]);

    const candidateRows = [
      { userId: uuid, available: true, weight: 1, lastAssignedAt: null, openItemCount: 2 },
      { userId: otherUuid, available: true, weight: 2, lastAssignedAt: now, openItemCount: 1 },
    ];
    const customQuery = vi.fn(async (sql: string) => {
      if (sql.includes('eligible_workers')) return { rows: candidateRows };
      return exactMutationQuery()(sql);
    });
    const custom = { key: 'custom_v5', select: vi.fn(async () => otherUuid) };
    const customHarness = directItemsHarness(
      customQuery,
      { strategy: 'custom_v5', strategyConfig: { lane: 'north' } },
      uuid,
      new WorklistStrategyRegistry([custom]),
    );
    await customHarness.service.assignNext(uuid);
    expect(custom).toMatchObject({ key: 'custom_v5' });
    expect(custom.select).toHaveBeenCalledWith({
      queueId: uuid,
      candidates: candidateRows,
      strategyConfig: { lane: 'north' },
    });
    expect(customQuery.mock.calls[0]).toStrictEqual([
      `select user_id as "userId", is_available as available, weight,
           last_assigned_at as "lastAssignedAt", open_item_count as "openItemCount"
         from worklist.eligible_workers($1)`,
      [uuid],
    ]);
    expect(customHarness.observed.tx.mock.calls[0]?.[1]).toStrictEqual({
      role: 'reader',
      readonly: true,
    });
    expect(customQuery.mock.calls.find(([sql]) => sql.includes('item_assign_next'))).toStrictEqual([
      'select worklist.item_assign_next($1, $2, $3) as item_id',
      [uuid, otherUuid, 'custom_v5'],
    ]);

    const outside = { key: 'outside_v5', select: vi.fn(async () => 'outside-user') };
    await expect(
      directItemsHarness(
        customQuery,
        { strategy: 'outside_v5' },
        uuid,
        new WorklistStrategyRegistry([outside]),
      ).service.assignNext(uuid),
    ).rejects.toMatchObject({
      message: 'Custom strategy selected a user outside the eligible candidate set',
      context: { queueId: uuid, strategy: 'outside_v5', selected: 'outside-user' },
    });
  });

  it('projects supervisor release and reassign SQL with exact parameters', async () => {
    const releaseQuery = exactMutationQuery();
    await directItemsHarness(releaseQuery).service.supervisorOverride({
      itemId: uuid,
      operation: 'release',
      reason: 'supervisor release',
    });
    expect(releaseQuery.mock.calls).toContainEqual([
      'select worklist.item_release($1, $2, true)',
      [uuid, 'supervisor release'],
    ]);

    const reassignQuery = exactMutationQuery();
    await directItemsHarness(reassignQuery).service.supervisorOverride({
      itemId: uuid,
      operation: 'reassign',
      reason: 'specialist route',
      toUserId: otherUuid,
    });
    expect(reassignQuery.mock.calls).toContainEqual([
      'select worklist.item_reassign($1, $2, $3, true)',
      [uuid, otherUuid, 'specialist route'],
    ]);
  });

  it('retains item get and unfiltered list SQL, parameters, and reader options', async () => {
    const getQuery = exactMutationQuery();
    const getHarness = directItemsHarness(getQuery);
    await getHarness.service.get(uuid);
    expect(getHarness.observed.tx.mock.calls[0]?.[1]).toStrictEqual({
      role: 'reader',
      readonly: true,
    });
    expect(getQuery.mock.calls[0]).toStrictEqual([
      `select ${ITEM_COLUMNS} from worklist.items where id = $1`,
      [uuid],
    ]);

    const listQuery = exactMutationQuery();
    const listHarness = directItemsHarness(listQuery);
    await listHarness.service.list({ page: 2, pageSize: 25 });
    expect(listHarness.observed.tx.mock.calls[0]?.[1]).toStrictEqual({
      role: 'reader',
      readonly: true,
    });
    expect(listQuery.mock.calls).toStrictEqual([
      [
        `select ${ITEM_COLUMNS} from worklist.items ${''}
         order by priority, due_at asc nulls last, created_at, id
         limit $1 offset $2`,
        [25, 25],
      ],
      ['select count(*)::text as total from worklist.items ', []],
    ]);
  });

  it('retains unfiltered event list SQL, parameters, and reader options', async () => {
    const query = exactMutationQuery();
    const harness = directItemsHarness(query);
    await harness.service.listEvents({ page: 3, pageSize: 10 });
    expect(harness.observed.tx.mock.calls[0]?.[1]).toStrictEqual({
      role: 'reader',
      readonly: true,
    });
    expect(query.mock.calls).toStrictEqual([
      [
        `select ${EVENT_COLUMNS} from worklist.item_events ${''}
         order by created_at, id limit $1 offset $2`,
        [10, 20],
      ],
      ['select count(*)::text as total from worklist.item_events ', []],
    ]);
  });

  it('binds claim latest-event and release offset queries to exact parameters', async () => {
    const directClaimQuery = exactMutationQuery();
    await directItemsHarness(directClaimQuery).service.claim(uuid, otherUuid);
    expect(directClaimQuery.mock.calls).toContainEqual([
      'select worklist.item_claim($1, $2)',
      [uuid, otherUuid],
    ]);

    const claimQuery = exactMutationQuery();
    const claimHarness = directItemsHarness(claimQuery);
    await claimHarness.service.claimNext(uuid);
    expect(claimQuery.mock.calls[0]).toStrictEqual([
      'select worklist.item_claim_next($1, $2) as item_id',
      [uuid, null],
    ]);
    expect(
      claimQuery.mock.calls.find(([sql]) => sql.includes('order by created_at desc')),
    ).toStrictEqual([
      `select ${EVENT_COLUMNS} from worklist.item_events
           where item_id = $1 order by created_at desc, id desc limit 1`,
      [uuid],
    ]);
    expect(claimHarness.eventSink.publish).toHaveBeenCalledWith(mapEventRow(eventRow));

    const releaseQuery = exactMutationQuery();
    const releaseHarness = directItemsHarness(releaseQuery);
    await releaseHarness.service.release(uuid, 'return to queue');
    expect(releaseQuery.mock.calls).toContainEqual([
      'select count(*)::text as total from worklist.item_events where item_id = $1',
      [uuid],
    ]);
    expect(releaseQuery.mock.calls).toContainEqual([
      'select worklist.item_release($1, $2, false)',
      [uuid, 'return to queue'],
    ]);
    expect(releaseQuery.mock.calls.find(([sql]) => sql.includes('offset $2'))).toStrictEqual([
      `select ${EVENT_COLUMNS} from worklist.item_events
           where item_id = $1 order by created_at, id offset $2`,
      [uuid, 1],
    ]);
  });
});
