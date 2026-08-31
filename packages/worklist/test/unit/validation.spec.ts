import { describe, expect, it } from 'vitest';
import {
  createQueueSchema,
  enqueueWorkItemSchema,
  eventListQuerySchema,
  itemListQuerySchema,
  pageQuerySchema,
  parseWorklistInput,
  scheduleBreachSchema,
  supervisorOverrideSchema,
  updateQueueSchema,
  workerStateSchema,
} from '../../src/validation';

describe('worklist validation', () => {
  it('accepts canonical queue permissions and an extensible strategy key', () => {
    expect(
      createQueueSchema.parse({
        code: 'rait-review',
        name: 'RAIT review',
        strategy: 'expertise_v1',
        requiredPermission: 'rait:review:appeals',
        supervisorPermission: 'rait:supervise:appeals',
        claimLimit: 7,
        defaultDeadline: { kind: 'business_days', businessDays: 15, calendarKey: 'detran-sp' },
      }),
    ).toMatchObject({
      strategy: 'expertise_v1',
      requiredPermission: 'rait:review:appeals',
      claimLimit: 7,
    });
  });

  it.each([
    'rait:review',
    'rait::appeals',
    'rait:review:appeals:extra',
    'rait review appeals',
    '*:review:appeals',
  ])('rejects a non-concrete worker permission: %s', (permission) => {
    expect(() =>
      createQueueSchema.parse({
        code: 'rait-review',
        name: 'RAIT review',
        requiredPermission: permission,
        supervisorPermission: 'rait:supervise:appeals',
      }),
    ).toThrow();
  });

  it('requires exactly one queue default deadline shape', () => {
    expect(() =>
      createQueueSchema.parse({
        code: 'invalid-sla',
        name: 'Invalid SLA',
        requiredPermission: 'rait:review:appeals',
        supervisorPermission: 'rait:supervise:appeals',
        defaultDeadline: { kind: 'elapsed', seconds: 0 },
      }),
    ).toThrow();

    expect(
      createQueueSchema.parse({
        code: 'elapsed-sla',
        name: 'Elapsed SLA',
        requiredPermission: 'rait:review:appeals',
        supervisorPermission: 'rait:supervise:appeals',
        defaultDeadline: { kind: 'elapsed', seconds: 3_600 },
      }).defaultDeadline,
    ).toEqual({ kind: 'elapsed', seconds: 3_600 });
  });

  it('validates polymorphic refs and absolute or business-day item deadlines', () => {
    expect(
      enqueueWorkItemSchema.parse({
        queueCode: 'rait-review',
        entityType: 'flow.task',
        entityId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
        deadline: { kind: 'absolute', dueAt: '2026-09-01T12:00:00.000Z' },
      }).deadline,
    ).toMatchObject({ kind: 'absolute' });

    expect(
      enqueueWorkItemSchema.parse({
        queueCode: 'rait-review',
        entityType: 'rait.appeal',
        entityId: 'appeal-42',
        deadline: { kind: 'business_days', businessDays: 10 },
      }).deadline,
    ).toEqual({ kind: 'business_days', businessDays: 10 });

    expect(() =>
      enqueueWorkItemSchema.parse({
        queueCode: 'rait-review',
        entityType: '',
        entityId: 'appeal-42',
      }),
    ).toThrow();
  });

  it('constrains worker state and supervisor override inputs', () => {
    expect(
      workerStateSchema.parse({
        userId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
        available: false,
        weight: 1.5,
      }),
    ).toEqual({
      userId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
      available: false,
      weight: 1.5,
    });
    expect(() =>
      workerStateSchema.parse({
        userId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
        available: true,
        weight: 0,
      }),
    ).toThrow();

    expect(() =>
      supervisorOverrideSchema.parse({
        itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
        operation: 'reassign',
        reason: ' ',
      }),
    ).toThrow();
    expect(() =>
      supervisorOverrideSchema.parse({
        itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
        operation: 'reassign',
        reason: 'JARI board substitution',
      }),
    ).toThrow();
  });

  it('materializes every governed default and preserves every supplied filter', () => {
    expect(pageQuerySchema.parse({})).toStrictEqual({ page: 1, pageSize: 50 });
    expect(itemListQuerySchema.parse({})).toStrictEqual({ page: 1, pageSize: 50 });
    expect(
      itemListQuerySchema.parse({
        page: 2,
        pageSize: 75,
        queueId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
        status: 'claimed',
        assigneeId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
        entityType: 'flow.task',
      }),
    ).toStrictEqual({
      page: 2,
      pageSize: 75,
      queueId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
      status: 'claimed',
      assigneeId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
      entityType: 'flow.task',
    });
    expect(
      eventListQuerySchema.parse({
        page: 3,
        pageSize: 25,
        itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
        after: '2026-08-24T12:00:00.000Z',
        afterId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
      }),
    ).toStrictEqual({
      page: 3,
      pageSize: 25,
      itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
      after: '2026-08-24T12:00:00.000Z',
      afterId: '01978f4a-32bf-7c27-a131-fd73a9e201a1',
    });
    expect(scheduleBreachSchema.parse({ intervalSeconds: 30 })).toStrictEqual({
      intervalSeconds: 30,
      limit: 100,
    });
  });

  it('keeps queue update and supervisor union outputs exact', () => {
    expect(
      updateQueueSchema.parse({
        name: 'Appeals',
        description: null,
        strategy: 'expertise_v2',
        strategyConfig: { region: 'sp' },
        requiredPermission: 'rait:review:appeals',
        supervisorPermission: 'rait:supervise:appeals',
        claimLimit: null,
        defaultDeadline: null,
        meta: { owner: 'board' },
      }),
    ).toStrictEqual({
      name: 'Appeals',
      description: null,
      strategy: 'expertise_v2',
      strategyConfig: { region: 'sp' },
      requiredPermission: 'rait:review:appeals',
      supervisorPermission: 'rait:supervise:appeals',
      claimLimit: null,
      defaultDeadline: null,
      meta: { owner: 'board' },
    });
    expect(
      supervisorOverrideSchema.parse({
        itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
        operation: 'complete',
        reason: 'review complete',
        payload: { result: 'approved' },
      }),
    ).toStrictEqual({
      itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
      operation: 'complete',
      reason: 'review complete',
      payload: { result: 'approved' },
    });
  });

  it('retains the exact supervisor reassign issue path and message', () => {
    const parsed = supervisorOverrideSchema.safeParse({
      itemId: '01978f4a-32bf-7c27-a131-fd73a9e101a1',
      operation: 'reassign',
      reason: 'route to eligible reviewer',
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('expected supervisor validation failure');
    expect(
      parsed.error.issues.map(({ code, path, message }) => ({ code, path, message })),
    ).toStrictEqual([
      {
        code: 'custom',
        path: ['toUserId'],
        message: 'toUserId is required for reassign override',
      },
    ]);
  });

  it('wraps schema failures with the exact public message and issue context', () => {
    const parsed = pageQuerySchema.safeParse({ page: 0 });
    expect(parsed.success).toBe(false);
    if (parsed.success) throw new Error('expected page validation failure');
    let captured: unknown;
    try {
      parseWorklistInput(pageQuerySchema, { page: 0 });
    } catch (error) {
      captured = error;
    }
    expect(captured).toMatchObject({
      message: 'Worklist input validation failed',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
      context: { issues: parsed.error.issues },
    });
    expect((captured as { context: unknown }).context).toStrictEqual({
      issues: parsed.error.issues,
    });
  });
});
