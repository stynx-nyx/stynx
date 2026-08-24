import { describe, expect, it } from 'vitest';
import {
  createQueueSchema,
  enqueueWorkItemSchema,
  supervisorOverrideSchema,
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
});
