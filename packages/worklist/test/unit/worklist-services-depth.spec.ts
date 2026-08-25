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
    await expect(
      new NoopWorklistEventSink().publish(mapEventRow(eventRow)),
    ).resolves.toBeUndefined();
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
    ).resolves.toBeNull();
    await expect(
      new LoadBalancedWorklistStrategy().select({ queueId: uuid, candidates: [] }),
    ).resolves.toBeNull();
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
    expect(success.eventSink.publish).toHaveBeenCalled();
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
    await expect(itemsHarness(empty).service.claimNext(uuid)).resolves.toBeNull();
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
    ).resolves.toBeNull();
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
    expect(sink.publish).toHaveBeenCalled();
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
