import { describe, expect, it, vi } from 'vitest';
import { TenantBusinessCalendar, WorklistInputError } from '../../src';

const A = '01978f4a-32bf-7c27-a131-fd73a9e101a1';
const B = '01978f4a-32bf-7c27-a131-fd73a9e101a2';

function makeCalendar(
  zones: Record<string, string>,
  holidaySets: Record<string, ReadonlySet<string>> = {},
) {
  return new TenantBusinessCalendar({
    timezoneForTenant: vi.fn((tenantId: string) => zones[tenantId]),
    holidaysFor: vi.fn(({ tenantId, year }: { tenantId: string; calendarKey?: string; year: number }) =>
      holidaySets[`${tenantId}:${year}`] ?? new Set<string>(),
    ),
  });
}

async function deadline(
  calendar: TenantBusinessCalendar,
  tenantId: string,
  startAt: string,
  businessDays: number,
  calendarKey?: string,
) {
  return calendar.addBusinessDays({
    tenantId,
    startAt: new Date(startAt),
    businessDays,
    ...(calendarKey ? { calendarKey } : {}),
  });
}

describe('TenantBusinessCalendar', () => {
  it('uses each tenant’s timezone and supplied holidays, passing calendarKey to the source', async () => {
    const timezoneForTenant = vi.fn((tenantId: string) => tenantId === A ? 'America/New_York' : 'Pacific/Auckland');
    const holidaysFor = vi.fn(({ tenantId, year }: { tenantId: string; calendarKey?: string; year: number }) =>
      new Set(tenantId === A && year === 2024 ? ['2024-07-04', '2024-07-05'] : []),
    );
    const calendar = new TenantBusinessCalendar({ timezoneForTenant, holidaysFor });

    await expect(deadline(calendar, A, '2024-07-03T16:00:00.000Z', 1, 'ny-office'))
      .resolves.toEqual(new Date('2024-07-09T04:00:00.000Z'));
    await expect(deadline(calendar, B, '2024-07-03T16:00:00.000Z', 1, 'au-office'))
      .resolves.toEqual(new Date('2024-07-05T12:00:00.000Z'));
    expect(timezoneForTenant).toHaveBeenCalledWith(A);
    expect(timezoneForTenant).toHaveBeenCalledWith(B);
    expect(holidaysFor).toHaveBeenCalledWith({ tenantId: A, calendarKey: 'ny-office', year: 2024 });
    expect(holidaysFor).toHaveBeenCalledWith({ tenantId: B, calendarKey: 'au-office', year: 2024 });
  });

  it('excludes the starting date and returns the start instant unchanged for zero days', async () => {
    const calendar = makeCalendar({ [A]: 'UTC' });
    const start = new Date('2024-03-08T18:45:12.345Z');

    await expect(calendar.addBusinessDays({ tenantId: A, startAt: start, businessDays: 0 }))
      .resolves.toEqual(start);
    const zeroResult = await calendar.addBusinessDays({ tenantId: A, startAt: start, businessDays: 0 });
    expect(zeroResult).not.toBe(start);
    await expect(deadline(calendar, A, '2024-03-08T18:45:12.345Z', 1))
      .resolves.toEqual(new Date('2024-03-12T00:00:00.000Z'));
  });

  it('counts weekdays across weekends, local holidays, leap day, and a year change', async () => {
    const calendar = makeCalendar(
      { [A]: 'UTC' },
      { [`${A}:2024`]: new Set(['2024-02-26', '2024-12-31']), [`${A}:2025`]: new Set(['2025-01-01']) },
    );

    await expect(deadline(calendar, A, '2024-02-23T10:00:00Z', 2))
      .resolves.toEqual(new Date('2024-02-29T00:00:00Z'));
    await expect(deadline(calendar, A, '2024-12-30T10:00:00Z', 1))
      .resolves.toEqual(new Date('2025-01-03T00:00:00Z'));
  });

  it.each([
    ['spring forward', '2024-03-09T17:00:00.000Z', '2024-03-12T04:00:00.000Z', 59],
    ['fall back', '2024-11-02T16:00:00.000Z', '2024-11-05T05:00:00.000Z', 61],
  ])('adds by civil date through DST %s, not by 24-hour duration', async (_label, start, expected, hours) => {
    const calendar = makeCalendar({ [A]: 'America/New_York' });
    const result = await deadline(calendar, A, start, 1);

    expect(result).toEqual(new Date(expected));
    expect(result.getTime() - new Date(start).getTime()).toBe(hours * 60 * 60 * 1_000);
  });

  it('uses the local date at UTC midnight boundaries and observes changed tenant timezones', async () => {
    const zones: Record<string, string> = { [A]: 'America/Los_Angeles', [B]: 'Asia/Tokyo' };
    const calendar = new TenantBusinessCalendar({
      timezoneForTenant: (tenantId: string) => zones[tenantId],
      holidaysFor: () => new Set<string>(),
    });

    await expect(deadline(calendar, A, '2024-05-06T00:30:00.000Z', 1))
      .resolves.toEqual(new Date('2024-05-08T07:00:00.000Z'));
    await expect(deadline(calendar, B, '2024-05-05T23:30:00.000Z', 1))
      .resolves.toEqual(new Date('2024-05-07T15:00:00.000Z'));
    zones[A] = 'Asia/Tokyo';
    await expect(deadline(calendar, A, '2024-05-06T00:30:00.000Z', 1))
      .resolves.toEqual(new Date('2024-05-07T15:00:00.000Z'));
  });

  it('propagates timezone and holiday source failures without a fallback', async () => {
    const timezoneFailure = new Error('tenant timezone unavailable');
    const brokenZone = new TenantBusinessCalendar({ timezoneForTenant: () => { throw timezoneFailure; }, holidaysFor: () => new Set() });
    await expect(deadline(brokenZone, A, '2024-05-06T00:00:00Z', 1)).rejects.toBe(timezoneFailure);

    const holidayFailure = new Error('holiday source unavailable');
    const brokenHolidays = new TenantBusinessCalendar({ timezoneForTenant: () => 'UTC', holidaysFor: () => { throw holidayFailure; } });
    await expect(deadline(brokenHolidays, A, '2024-05-06T00:00:00Z', 1)).rejects.toBe(holidayFailure);
  });

  it('rejects invalid inputs and impossible calendars with typed errors', async () => {
    const calendar = makeCalendar({ [A]: 'UTC' });
    const invalidInputs: Array<[string, () => Promise<Date>]> = [
      ['invalid start', () => calendar.addBusinessDays({ tenantId: A, startAt: new Date('invalid'), businessDays: 1 })],
      ['negative count', () => deadline(calendar, A, '2024-01-01T00:00:00Z', -1)],
      ['fractional count', () => deadline(calendar, A, '2024-01-01T00:00:00Z', 1.5)],
      ['NaN count', () => deadline(calendar, A, '2024-01-01T00:00:00Z', Number.NaN)],
      ['infinite count', () => deadline(calendar, A, '2024-01-01T00:00:00Z', Number.POSITIVE_INFINITY)],
      ['count above maximum', () => deadline(calendar, A, '2024-01-01T00:00:00Z', 367)],
      ['invalid holiday', () => deadline(makeCalendar({ [A]: 'UTC' }, { [`${A}:2024`]: new Set(['2024-02-30']) }), A, '2024-01-01T00:00:00Z', 1)],
      ['invalid zone', () => deadline(makeCalendar({ [A]: 'No/Such_Zone' }), A, '2024-01-01T00:00:00Z', 1)],
      ['invalid zone source', () => deadline(makeCalendar({}), A, '2024-01-01T00:00:00Z', 1)],
    ];

    for (const [label, operation] of invalidInputs) {
      const result = operation();
      await expect(result, label).rejects.toBeInstanceOf(WorklistInputError);
      await expect(result, label).rejects.toMatchObject({ code: 'WORKLIST_INPUT_INVALID' });
    }

    const exhausted = new TenantBusinessCalendar({
      timezoneForTenant: () => 'UTC',
      holidaysFor: ({ year }: { year: number }) => {
        const holidays = new Set<string>();
        for (let day = new Date(`${year}-01-01T00:00:00Z`); day.getUTCFullYear() === year; day.setUTCDate(day.getUTCDate() + 1)) {
          if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) holidays.add(day.toISOString().slice(0, 10));
        }
        return holidays;
      },
    });
    await expect(deadline(exhausted, A, '2024-01-01T12:00:00Z', 1))
      .rejects.toBeInstanceOf(WorklistInputError);
    await expect(deadline(exhausted, A, '2024-01-01T12:00:00Z', 1))
      .rejects.toMatchObject({ code: 'WORKLIST_INPUT_INVALID', context: { reason: 'calendar_exhausted' } });
  });
});
