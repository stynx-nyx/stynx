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
});
