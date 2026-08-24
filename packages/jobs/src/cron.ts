import { InvalidCronExpressionError } from './errors';

/**
 * A minimal 5-field cron parser and next-run calculator: `minute hour
 * day-of-month month day-of-week`, evaluated in UTC. Supports `*`, single
 * values, comma lists, `a-b` ranges, and `/n` steps (on `*` or a range) in
 * each field — "cron-ish" per the E2 requirement, not the full POSIX cron
 * grammar (no `L`/`W`/`#`, no named months/days, no timezone).
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

/**
 * Compute the next UTC minute-boundary matching `expression` strictly after
 * `after`. Throws `InvalidCronExpressionError` if the expression is
 * malformed or (pathologically) matches nothing within the search ceiling.
 */
export function nextCronRunAt(expression: string, after: Date): Date {
  const parsed = parseCronExpression(expression);
  let candidate = new Date(after.getTime());
  candidate.setUTCSeconds(0, 0);
  candidate = new Date(candidate.getTime() + 60_000);

  for (let step = 0; step < MAX_SEARCH_MINUTES; step += 1) {
    const minute = candidate.getUTCMinutes();
    const hour = candidate.getUTCHours();
    const dayOfMonth = candidate.getUTCDate();
    const month = candidate.getUTCMonth() + 1;
    const dayOfWeek = candidate.getUTCDay();

    const domMatches = parsed.dayOfMonth.has(dayOfMonth);
    const dowMatches = parsed.dayOfWeek.has(dayOfWeek);
    const dayMatches =
      parsed.dayOfMonthRestricted && parsed.dayOfWeekRestricted
        ? domMatches || dowMatches
        : domMatches && dowMatches;

    if (parsed.minute.has(minute) && parsed.hour.has(hour) && parsed.month.has(month) && dayMatches) {
      return candidate;
    }
    candidate = new Date(candidate.getTime() + 60_000);
  }

  throw new InvalidCronExpressionError(expression);
}
