import { WorklistCalendarRequiredError, WorklistInputError } from './errors';
import type { WorklistBusinessCalendar } from './ports';
import type {
  ResolvedWorklistDeadline,
  WorklistDeadline,
  WorklistQueueDefaultDeadline,
} from './types';

function validDate(value: Date | string, field: string): Date {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new WorklistInputError(`${field} must be a valid date`);
  }
  return date;
}

export async function resolveWorklistDeadline(input: {
  tenantId: string;
  now: Date;
  deadline?: WorklistDeadline;
  queueDefault?: WorklistQueueDefaultDeadline | null;
  calendar?: WorklistBusinessCalendar | null | undefined;
}): Promise<ResolvedWorklistDeadline | null> {
  if (input.deadline?.kind === 'absolute') {
    return {
      kind: 'absolute',
      dueAt: validDate(input.deadline.dueAt, 'dueAt'),
      businessDays: null,
      calendarKey: null,
    };
  }

  if (input.deadline?.kind === 'business_days') {
    return resolveBusinessDays({
      tenantId: input.tenantId,
      now: input.now,
      businessDays: input.deadline.businessDays,
      ...(input.deadline.calendarKey ? { calendarKey: input.deadline.calendarKey } : {}),
      ...(input.deadline.startAt ? { startAt: validDate(input.deadline.startAt, 'startAt') } : {}),
      calendar: input.calendar,
    });
  }

  if (input.queueDefault?.kind === 'elapsed') {
    return {
      kind: 'absolute',
      dueAt: new Date(input.now.getTime() + input.queueDefault.seconds * 1_000),
      businessDays: null,
      calendarKey: null,
    };
  }

  if (input.queueDefault?.kind === 'business_days') {
    return resolveBusinessDays({
      tenantId: input.tenantId,
      now: input.now,
      businessDays: input.queueDefault.businessDays,
      ...(input.queueDefault.calendarKey ? { calendarKey: input.queueDefault.calendarKey } : {}),
      calendar: input.calendar,
    });
  }

  return null;
}

async function resolveBusinessDays(input: {
  tenantId: string;
  now: Date;
  businessDays: number;
  calendarKey?: string;
  startAt?: Date;
  calendar?: WorklistBusinessCalendar | null | undefined;
}): Promise<ResolvedWorklistDeadline> {
  if (!input.calendar) {
    throw new WorklistCalendarRequiredError();
  }
  const startAt = input.startAt ?? input.now;
  const dueAt = await input.calendar.addBusinessDays({
    tenantId: input.tenantId,
    ...(input.calendarKey ? { calendarKey: input.calendarKey } : {}),
    startAt,
    businessDays: input.businessDays,
  });
  const resolved = validDate(dueAt, 'business calendar result');
  if (resolved.getTime() < startAt.getTime()) {
    throw new WorklistInputError('business calendar returned a deadline before its start');
  }
  return {
    kind: 'business_days',
    dueAt: resolved,
    businessDays: input.businessDays,
    calendarKey: input.calendarKey ?? null,
  };
}
