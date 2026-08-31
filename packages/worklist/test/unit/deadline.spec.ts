import { describe, expect, it, vi } from 'vitest';
import { resolveWorklistDeadline } from '../../src/deadline';
import type { WorklistBusinessCalendar } from '../../src/ports';

const tenantId = '01978f4a-32bf-7c27-a131-fd73a9e101a1';
const now = new Date('2026-08-24T12:00:00.000Z');

describe('resolveWorklistDeadline', () => {
  it('prefers an explicit absolute deadline over queue defaults', async () => {
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        deadline: { kind: 'absolute', dueAt: '2026-08-30T18:00:00.000Z' },
        queueDefault: { kind: 'elapsed', seconds: 60 },
      }),
    ).resolves.toEqual({
      kind: 'absolute',
      dueAt: new Date('2026-08-30T18:00:00.000Z'),
      businessDays: null,
      calendarKey: null,
    });
  });

  it('resolves an elapsed queue default from the injected clock value', async () => {
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        queueDefault: { kind: 'elapsed', seconds: 90 },
      }),
    ).resolves.toEqual({
      kind: 'absolute',
      dueAt: new Date('2026-08-24T12:01:30.000Z'),
      businessDays: null,
      calendarKey: null,
    });
  });

  it('delegates business-day arithmetic without inventing holiday rules', async () => {
    const addBusinessDays = vi.fn().mockResolvedValue(new Date('2026-09-08T12:00:00.000Z'));
    const calendar: WorklistBusinessCalendar = { addBusinessDays };

    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        deadline: {
          kind: 'business_days',
          businessDays: 10,
          calendarKey: 'detran-sp',
          startAt: '2026-08-25T15:00:00.000Z',
        },
        calendar,
      }),
    ).resolves.toEqual({
      kind: 'business_days',
      dueAt: new Date('2026-09-08T12:00:00.000Z'),
      businessDays: 10,
      calendarKey: 'detran-sp',
    });
    expect(addBusinessDays).toHaveBeenCalledWith({
      tenantId,
      calendarKey: 'detran-sp',
      startAt: new Date('2026-08-25T15:00:00.000Z'),
      businessDays: 10,
    });
  });

  it('fails closed when business-day arithmetic has no calendar adapter', async () => {
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        deadline: { kind: 'business_days', businessDays: 5 },
      }),
    ).rejects.toThrow('business calendar');
  });

  it('returns no clock when neither item nor queue defines one', async () => {
    await expect(resolveWorklistDeadline({ tenantId, now })).resolves.toEqual(null);
  });

  it('keeps the valid queue elapsed deadline observable without mutating the clock', async () => {
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        queueDefault: { kind: 'elapsed', seconds: 125 },
      }),
    ).resolves.toStrictEqual({
      kind: 'absolute',
      dueAt: new Date('2026-08-24T12:02:05.000Z'),
      businessDays: null,
      calendarKey: null,
    });
    expect(now).toStrictEqual(new Date('2026-08-24T12:00:00.000Z'));
  });

  it('accepts a business-calendar result exactly equal to its resolved start boundary', async () => {
    const startAt = new Date('2026-08-25T09:30:00.000Z');
    const addBusinessDays = vi.fn().mockResolvedValue(new Date(startAt));
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        deadline: {
          kind: 'business_days',
          businessDays: 1,
          calendarKey: 'municipal-sp',
          startAt,
        },
        calendar: { addBusinessDays },
      }),
    ).resolves.toStrictEqual({
      kind: 'business_days',
      dueAt: startAt,
      businessDays: 1,
      calendarKey: 'municipal-sp',
    });
    expect(addBusinessDays).toHaveBeenCalledOnce();
    expect(addBusinessDays).toHaveBeenCalledWith({
      tenantId,
      calendarKey: 'municipal-sp',
      startAt,
      businessDays: 1,
    });
  });

  it('keeps optional calendar keys and resolved output objects exact', async () => {
    const addBusinessDays = vi.fn().mockResolvedValue(new Date('2026-08-28T09:30:00.000Z'));
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        queueDefault: { kind: 'business_days', businessDays: 3 },
        calendar: { addBusinessDays },
      }),
    ).resolves.toStrictEqual({
      kind: 'business_days',
      dueAt: new Date('2026-08-28T09:30:00.000Z'),
      businessDays: 3,
      calendarKey: null,
    });
    expect(addBusinessDays).toHaveBeenCalledTimes(1);
    expect(addBusinessDays).toHaveBeenLastCalledWith({
      tenantId,
      startAt: now,
      businessDays: 3,
    });
  });

  it('preserves exact public error identities for invalid deadline boundaries', async () => {
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        deadline: { kind: 'absolute', dueAt: 'not-a-date' },
      }),
    ).rejects.toMatchObject({
      message: 'dueAt must be a valid date',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        deadline: {
          kind: 'business_days',
          businessDays: 1,
          startAt: 'not-a-date',
        },
        calendar: { addBusinessDays: async () => now },
      }),
    ).rejects.toMatchObject({
      message: 'startAt must be a valid date',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        queueDefault: { kind: 'business_days', businessDays: 1 },
        calendar: { addBusinessDays: async () => new Date('not-a-date') },
      }),
    ).rejects.toMatchObject({
      message: 'business calendar result must be a valid date',
      code: 'WORKLIST_INPUT_INVALID',
      status: 400,
    });
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        queueDefault: { kind: 'business_days', businessDays: 1 },
      }),
    ).rejects.toMatchObject({
      message: 'A business calendar adapter is required for business-day deadlines',
      code: 'WORKLIST_BUSINESS_CALENDAR_REQUIRED',
      status: 500,
    });
  });

  it('forwards a queue business-calendar key into both the exact result and adapter call', async () => {
    const dueAt = new Date('2026-08-27T12:00:00.000Z');
    const addBusinessDays = vi.fn().mockResolvedValue(dueAt);
    await expect(
      resolveWorklistDeadline({
        tenantId,
        now,
        queueDefault: { kind: 'business_days', businessDays: 2, calendarKey: 'state-sp' },
        calendar: { addBusinessDays },
      }),
    ).resolves.toStrictEqual({
      kind: 'business_days',
      dueAt,
      businessDays: 2,
      calendarKey: 'state-sp',
    });
    expect(addBusinessDays).toHaveBeenCalledOnce();
    expect(addBusinessDays).toHaveBeenCalledWith({
      tenantId,
      calendarKey: 'state-sp',
      startAt: now,
      businessDays: 2,
    });
  });
});
