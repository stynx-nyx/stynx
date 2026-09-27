import { describe, expect, it, vi } from 'vitest';
import type { Clock } from '@stynx-nyx/core';
import { resolveWorklistDeadline } from '../../src/deadline';
import { StynxWorklistModule } from '../../src/worklist.module';
import { Global, Module } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import { RequestContext } from '@stynx-nyx/core';
import {
  TenantBusinessCalendar,
  WORKLIST_CLOCK,
  WORKLIST_BUSINESS_CALENDAR,
  type WorklistBusinessCalendar,
} from '../../src';
import { Test } from '@nestjs/testing';

@Global()
@Module({
  providers: [
    { provide: Database, useValue: {} },
    { provide: RequestContext, useValue: {} },
  ],
  exports: [Database, RequestContext],
})
class WorklistTestDependenciesModule {}

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

  it('resolves zero and positive days from the supplied instant in tenant zones behind and ahead of UTC', async () => {
    const calendar = new TenantBusinessCalendar({
      timezoneForTenant: (id: string) => id === tenantId ? 'America/Los_Angeles' : 'Asia/Tokyo',
      holidaysFor: () => new Set<string>(),
    });
    const startAt = new Date('2024-05-06T00:30:00.000Z');

    await expect(resolveWorklistDeadline({
      tenantId,
      now: new Date('2024-01-01T00:00:00Z'),
      deadline: { kind: 'business_days', businessDays: 0, startAt },
      calendar,
    })).resolves.toMatchObject({ dueAt: startAt, businessDays: 0 });
    await expect(resolveWorklistDeadline({
      tenantId,
      now: new Date('2024-01-01T00:00:00Z'),
      deadline: { kind: 'business_days', businessDays: 1, startAt },
      calendar,
    })).resolves.toMatchObject({ dueAt: new Date('2024-05-07T07:00:00.000Z'), businessDays: 1 });
    await expect(resolveWorklistDeadline({
      tenantId: `${tenantId.slice(0, -1)}2`,
      now: new Date('2024-01-01T00:00:00Z'),
      deadline: { kind: 'business_days', businessDays: 1, startAt },
      calendar,
    })).resolves.toMatchObject({ dueAt: new Date('2024-05-07T15:00:00.000Z'), businessDays: 1 });
  });

  it('registers the identical calendar and clock objects in StynxWorklistModule.forRoot', async () => {
    const clock: Clock = { now: vi.fn(() => new Date('2024-05-06T00:30:00.000Z')) };
    const calendar = new TenantBusinessCalendar({ timezoneForTenant: () => 'UTC', holidaysFor: () => new Set() });
    const module = await Test.createTestingModule({
      imports: [WorklistTestDependenciesModule, StynxWorklistModule.forRoot({ calendar, clock })],
    }).compile();

    expect(module.get(WORKLIST_CLOCK)).toBe(clock);
    expect(module.get(WORKLIST_BUSINESS_CALENDAR)).toBe(calendar);
    const result = await resolveWorklistDeadline({
      tenantId,
      now: module.get(WORKLIST_CLOCK).now(),
      queueDefault: { kind: 'business_days', businessDays: 1 },
      calendar: module.get(WORKLIST_BUSINESS_CALENDAR),
    });
    expect(clock.now).toHaveBeenCalledOnce();
    expect(result?.dueAt).toEqual(new Date('2024-05-08T00:00:00.000Z'));
    await module.close();
  });
});
