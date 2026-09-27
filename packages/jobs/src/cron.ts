import { InvalidCronExpressionError } from './errors';

/**
 * A minimal 5-field cron parser and next-run calculator: `minute hour
 * day-of-month month day-of-week`, evaluated in the selected timezone. Supports `*`, single
 * values, comma lists, `a-b` ranges, and `/n` steps (on `*` or a range) in
 * each field — "cron-ish" per the E2 requirement, not the full POSIX cron
 * grammar (no `L`/`W`/`#`, no named months/days).
 *
 * Day-of-month and day-of-week combine with OR semantics when both are
 * restricted (cron convention); when only one is restricted the other is
 * ignored, matching standard cron behavior.
 */

interface FieldRange {
  min: number;
  max: number;
}

const FIELD_RANGES: readonly [FieldRange, FieldRange, FieldRange, FieldRange, FieldRange] = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 6 }, // day of week (0 = Sunday)
];

function parseField(raw: string, range: FieldRange, expression: string): Set<number> {
  const values = new Set<number>();

  for (const part of raw.split(',')) {
    const segments = part.split('/');
    if (segments.length > 2 || segments.some((segment) => segment.length === 0)) {
      throw new InvalidCronExpressionError(expression);
    }
    const [basePart, stepPart] = segments as [string, string | undefined];

    let step = 1;
    if (stepPart !== undefined) {
      if (!/^\d+$/u.test(stepPart)) {
        throw new InvalidCronExpressionError(expression);
      }
      step = Number.parseInt(stepPart, 10);
      if (step <= 0) {
        throw new InvalidCronExpressionError(expression);
      }
    }

    let start: number;
    let end: number;
    if (basePart === '*') {
      start = range.min;
      end = range.max;
    } else {
      const rangeMatch = /^(\d+)(?:-(\d+))?$/u.exec(basePart);
      if (!rangeMatch) {
        throw new InvalidCronExpressionError(expression);
      }
      start = Number.parseInt(rangeMatch[1] as string, 10);
      end = rangeMatch[2] !== undefined
        ? Number.parseInt(rangeMatch[2], 10)
        : stepPart !== undefined
          ? range.max
          : start;
    }

    if (start < range.min || end > range.max || start > end) {
      throw new InvalidCronExpressionError(expression);
    }
    for (let value = start; value <= end; value += step) {
      values.add(value);
    }
  }

  return values;
}

export interface ParsedCron {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  dayOfMonthRestricted: boolean;
  dayOfWeekRestricted: boolean;
}

export function parseCronExpression(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/u);
  if (fields.length !== 5) {
    throw new InvalidCronExpressionError(expression);
  }
  const [minuteRaw, hourRaw, domRaw, monthRaw, dowRaw] = fields as [string, string, string, string, string];
  return {
    minute: parseField(minuteRaw, FIELD_RANGES[0], expression),
    hour: parseField(hourRaw, FIELD_RANGES[1], expression),
    dayOfMonth: parseField(domRaw, FIELD_RANGES[2], expression),
    month: parseField(monthRaw, FIELD_RANGES[3], expression),
    dayOfWeek: parseField(dowRaw, FIELD_RANGES[4], expression),
    dayOfMonthRestricted: domRaw !== '*',
    dayOfWeekRestricted: dowRaw !== '*',
  };
}

const MAX_SEARCH_MINUTES = 60 * 24 * 366 * 5; // ~5 years of minute-steps as a search ceiling

interface WallMinute {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function wallMinute(date: Date, formatter: Intl.DateTimeFormat): WallMinute {
  const parts = formatter.formatToParts(date);
  const number = (type: string): number => Number(parts.find(part => part.type === type)?.value);
  return { year: number('year'), month: number('month'), day: number('day'), hour: number('hour'), minute: number('minute') };
}

function wallTime(wall: WallMinute): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
}

function matches(parsed: ParsedCron, wall: WallMinute): boolean {
  const localDate = new Date(wallTime(wall));
  const domMatches = parsed.dayOfMonth.has(wall.day);
  const dowMatches = parsed.dayOfWeek.has(localDate.getUTCDay());
  const dayMatches = parsed.dayOfMonthRestricted && parsed.dayOfWeekRestricted
    ? domMatches || dowMatches
    : domMatches && dowMatches;
  return parsed.minute.has(wall.minute) && parsed.hour.has(wall.hour) && parsed.month.has(wall.month) && dayMatches;
}

function timezoneFormatter(timezone: string, expression: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch (error) {
    if (error instanceof RangeError) throw new InvalidCronExpressionError(expression);
    throw error;
  }
}

/**
 * Compute the next UTC minute-boundary matching `expression` strictly after
 * `after`. Throws `InvalidCronExpressionError` if the expression is
 * malformed or (pathologically) matches nothing within the search ceiling.
 */
export function nextCronRunAt(expression: string, after: Date, timezone = 'UTC'): Date {
  const parsed = parseCronExpression(expression);
  const formatter = timezone === 'UTC' ? undefined : timezoneFormatter(timezone, expression);
  let candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate = new Date(candidate.getTime() + 60_000);

  for (let step = 0; step < MAX_SEARCH_MINUTES; step += 1) {
    const wall = formatter ? wallMinute(candidate, formatter) : {
      year: candidate.getUTCFullYear(), month: candidate.getUTCMonth() + 1, day: candidate.getUTCDate(),
      hour: candidate.getUTCHours(), minute: candidate.getUTCMinutes(),
    };

    if (formatter) {
      const previous = wallMinute(new Date(candidate.getTime() - 60_000), formatter);
      const missingMinutes = Math.round((wallTime(wall) - wallTime(previous)) / 60_000) - 1;
      if (missingMinutes > 0) {
        for (let skipped = 1; skipped <= missingMinutes; skipped += 1) {
          const missingDate = new Date(wallTime(previous) + skipped * 60_000);
          if (matches(parsed, {
            year: missingDate.getUTCFullYear(), month: missingDate.getUTCMonth() + 1,
            day: missingDate.getUTCDate(), hour: missingDate.getUTCHours(), minute: missingDate.getUTCMinutes(),
          })) return candidate;
        }
      }
    }

    if (matches(parsed, wall)) {
      if (formatter) {
        // A backward offset change repeats local minutes. Skip the first UTC
        // occurrence; a second matching occurrence is found by the UTC scan.
        const tomorrow = new Date(candidate.getTime() + 24 * 60 * 60_000);
        const offsetDrop = wallTime(wall) - candidate.getTime()
          - (wallTime(wallMinute(tomorrow, formatter)) - tomorrow.getTime());
        if (offsetDrop > 0) {
          const later = wallMinute(new Date(candidate.getTime() + offsetDrop), formatter);
          if (wallTime(later) === wallTime(wall)) {
            candidate = new Date(candidate.getTime() + 60_000);
            continue;
          }
        }
      }
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 60_000);
  }

  throw new InvalidCronExpressionError(expression);
}
