import type { WorklistEvent } from './types';

export const WORKLIST_BUSINESS_CALENDAR = Symbol('WORKLIST_BUSINESS_CALENDAR');
export const WORKLIST_SCHEDULER = Symbol('WORKLIST_SCHEDULER');
export const WORKLIST_EVENT_SINK = Symbol('WORKLIST_EVENT_SINK');
export const WORKLIST_CLOCK = Symbol('WORKLIST_CLOCK');

export const WORKLIST_BREACH_JOB_TYPE = 'stynx.worklist.detect-breaches' as const;

export interface WorklistBusinessCalendar {
  addBusinessDays(input: {
    tenantId: string;
    calendarKey?: string;
    startAt: Date;
    businessDays: number;
  }): Promise<Date>;
}

export interface WorklistSchedulerPort {
  scheduleRecurring(input: {
    key: string;
    tenantId: string;
    jobType: typeof WORKLIST_BREACH_JOB_TYPE;
    intervalSeconds: number;
    payload: { tenantId: string; limit: number };
  }): Promise<unknown>;
}

export interface WorklistEventSink {
  publish(event: WorklistEvent): Promise<void>;
}

export interface WorklistClock {
  now(): Date;
}

export class SystemWorklistClock implements WorklistClock {
  now(): Date {
    return new Date();
  }
}

export class NoopWorklistEventSink implements WorklistEventSink {
  async publish(_event: WorklistEvent): Promise<void> {}
}
