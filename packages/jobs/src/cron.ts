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

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const MAX_SEARCH_MINUTES = 60 * 24 * 366 * 5; // preserve the existing five-year ceiling

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

function utcWall(date: Date): WallMinute {
  return {
    year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(),
    hour: date.getUTCHours(), minute: date.getUTCMinutes(),
  };
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
  if ((timezone !== 'UTC' && !timezone.includes('/')) || /^Etc\/GMT[+-]/u.test(timezone)) {
    throw new InvalidCronExpressionError(expression);
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      hourCycle: 'h23',
    });
  } catch {
    throw new InvalidCronExpressionError(expression);
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
  const first = Math.floor(after.getTime() / MINUTE_MS) * MINUTE_MS + MINUTE_MS;
  const last = first + (MAX_SEARCH_MINUTES - 1) * MINUTE_MS;
  const startWall = formatter ? wallMinute(new Date(first), formatter) : utcWall(new Date(first));
  const endWall = formatter ? wallMinute(new Date(last), formatter) : utcWall(new Date(last));
  const firstDay = Date.UTC(startWall.year, startWall.month - 1, startWall.day);
  const lastDay = Date.UTC(endWall.year, endWall.month - 1, endWall.day);
  const hours = [...parsed.hour].sort((a, b) => a - b);
  const minutes = [...parsed.minute].sort((a, b) => a - b);

  // Skip empty calendar dates before asking ICU about any timezone transitions.
  for (let dayTime = firstDay; dayTime <= lastDay; dayTime += DAY_MS) {
    const day = utcWall(new Date(dayTime));
    if (!parsed.month.has(day.month) || !matchesDay(parsed, day)) continue;

    const offsets = new Set<number>();
    const transitions: Array<{ at: number; before: number; after: number }> = [];
    if (formatter) {
      // Every instant belonging to this local date is within this UTC window.
      // Probe throughout it, then locate each observed change to the minute.
      const windowStart = dayTime - DAY_MS;
      const windowEnd = dayTime + 2 * DAY_MS;
      const offsetAt = (time: number): number => wallTime(wallMinute(new Date(time), formatter)) - time;
      let previousTime = windowStart;
      let previousOffset = offsetAt(previousTime);
      offsets.add(previousOffset);
      for (let probe = windowStart + 6 * 60 * MINUTE_MS; probe <= windowEnd; probe += 6 * 60 * MINUTE_MS) {
        const currentOffset = offsetAt(probe);
        if (currentOffset !== previousOffset) {
          let low = previousTime / MINUTE_MS;
          let high = probe / MINUTE_MS;
          while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            if (offsetAt(middle * MINUTE_MS) === previousOffset) low = middle;
            else high = middle;
          }
          transitions.push({ at: high * MINUTE_MS, before: previousOffset, after: currentOffset });
        }
        offsets.add(currentOffset);
        previousTime = probe;
        previousOffset = currentOffset;
      }
    } else offsets.add(0);

    let best: number | undefined;
    for (const hour of hours) {
      for (const minute of minutes) {
        const wall: WallMinute = { ...day, hour, minute };
        const local = wallTime(wall);
        // A fold has two representations; only its later UTC occurrence runs.
        let later: number | undefined;
        for (const offset of offsets) {
          const time = local - offset;
          if (time < first || time > last) continue;
          const resolved = formatter ? wallMinute(new Date(time), formatter) : utcWall(new Date(time));
          if (wallTime(resolved) === local && (later === undefined || time > later)) later = time;
        }
        if (later !== undefined && (best === undefined || later < best)) best = later;
      }
    }

    if (formatter) {
      for (const transition of transitions) {
        if (transition.after <= transition.before || transition.at < first || transition.at > last) continue;
        // A forward jump collapses every matching missing minute to its first
        // valid UTC minute. Check the missing wall range, including date changes.
        for (let missing = transition.at + transition.before; missing < transition.at + transition.after; missing += MINUTE_MS) {
          if (matches(parsed, utcWall(new Date(missing))) && (best === undefined || transition.at < best)) {
            best = transition.at;
            break;
          }
        }
      }
    }
    if (best !== undefined) return new Date(best);
  }

  throw new InvalidCronExpressionError(expression);
}

function matchesDay(parsed: ParsedCron, wall: WallMinute): boolean {
  const domMatches = parsed.dayOfMonth.has(wall.day);
  const dowMatches = parsed.dayOfWeek.has(new Date(wallTime(wall)).getUTCDay());
  return parsed.dayOfMonthRestricted && parsed.dayOfWeekRestricted
    ? domMatches || dowMatches
    : domMatches && dowMatches;
}
