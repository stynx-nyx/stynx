import { WorklistInputError } from './errors';
import type { WorklistBusinessCalendar } from './ports';

export interface TenantBusinessCalendarSource {
  timezoneForTenant(tenantId: string): Promise<string> | string;
  holidaysFor(input: {
    tenantId: string;
    calendarKey?: string;
    year: number;
  }): Promise<ReadonlySet<string>> | ReadonlySet<string>;
}

const DAY_MS = 86_400_000;
const MAX_CIVIL_DATES = 1_098;

function civilDay(year: number, month: number, day: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime() / DAY_MS;
}

function validHoliday(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const ordinal = civilDay(year, month, day);
  const date = new Date(ordinal * DAY_MS);
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function civilParts(ordinal: number): { year: number; month: number; day: number; key: string } {
  const date = new Date(ordinal * DAY_MS);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  return {
    year,
    month,
    day,
    key: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
  };
}

function localOrdinal(formatter: Intl.DateTimeFormat, instantMs: number): number {
  const parts = formatter.formatToParts(new Date(instantMs));
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return civilDay(year, month, day);
}

function startOfLocalDate(formatter: Intl.DateTimeFormat, ordinal: number): Date {
  // Search instants, rather than adding 24 hours, so skipped or duplicated
  // midnight resolves to the first instant belonging to the requested date.
  let lower = ordinal * DAY_MS - 2 * DAY_MS;
  let upper = ordinal * DAY_MS + 2 * DAY_MS;
  while (lower < upper) {
    const middle = lower + Math.floor((upper - lower) / 2);
    if (localOrdinal(formatter, middle) < ordinal) lower = middle + 1;
    else upper = middle;
  }
  if (localOrdinal(formatter, lower) !== ordinal) {
    throw new WorklistInputError('Due date does not exist in the tenant timezone');
  }
  return new Date(lower);
}

export class TenantBusinessCalendar implements WorklistBusinessCalendar {
  constructor(private readonly source: TenantBusinessCalendarSource) {}

  async addBusinessDays(input: {
    tenantId: string;
    calendarKey?: string;
    startAt: Date;
    businessDays: number;
  }): Promise<Date> {
    if (!Number.isSafeInteger(input.businessDays) || input.businessDays < 0 || input.businessDays > 366) {
      throw new WorklistInputError('businessDays must be an integer from 0 through 366');
    }
    if (!(input.startAt instanceof Date) || !Number.isFinite(input.startAt.getTime())) {
      throw new WorklistInputError('startAt must be a valid date');
    }

    const timezone = await this.source.timezoneForTenant(input.tenantId);
    if (typeof timezone !== 'string' || timezone.length === 0) {
      throw new WorklistInputError('Tenant timezone must be a valid IANA timezone');
    }
    let formatter: Intl.DateTimeFormat;
    try {
      formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      throw new WorklistInputError('Tenant timezone must be a valid IANA timezone');
    }

    if (input.businessDays === 0) return new Date(input.startAt);

    const holidaysByYear = new Map<number, ReadonlySet<string>>();
    const holidaysForYear = async (year: number): Promise<ReadonlySet<string>> => {
      const cached = holidaysByYear.get(year);
      if (cached) return cached;
      const supplied = await this.source.holidaysFor({
        tenantId: input.tenantId,
        ...(input.calendarKey === undefined ? {} : { calendarKey: input.calendarKey }),
        year,
      });
      if (!(supplied instanceof Set)) {
        throw new WorklistInputError('Tenant holidays must be a set of civil dates');
      }
      for (const holiday of supplied) {
        if (!validHoliday(holiday)) {
          throw new WorklistInputError('Tenant holiday must be a valid YYYY-MM-DD date');
        }
      }
      holidaysByYear.set(year, supplied);
      return supplied;
    };

    let ordinal = localOrdinal(formatter, input.startAt.getTime());
    let remaining = input.businessDays;
    for (let examined = 0; examined < MAX_CIVIL_DATES; examined += 1) {
      ordinal += 1;
      const dayOfWeek = new Date(ordinal * DAY_MS).getUTCDay();
      const { year, key } = civilParts(ordinal);
      const holidays = await holidaysForYear(year);
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.has(key)) {
        remaining -= 1;
        if (remaining === 0) return startOfLocalDate(formatter, ordinal + 1);
      }
    }
    throw new WorklistInputError('Business calendar exhausted', { reason: 'calendar_exhausted' });
  }
}
