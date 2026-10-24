import { insertJobRow, claimJobRows, getJobRow, upsertScheduleRow, getScheduleRow, dueScheduleRows, isJobRecord, isScheduleRecord } from './job-results.repository.js';
import { activeTenantMember, markSucceeded, markFailed, markDeadLetter, cancelJob, scheduleAdmission, setEnabled, deleteSchedule, disableInvalidSchedule, advanceSchedule } from './job-commands.repository.js';
import { Injectable } from '@nestjs/common';
import { Database, executeTypedCommand } from '@stynx-nyx/data';
import type { Transaction } from '@stynx-nyx/data';
import type { JobRecord, ScheduleRecord, JobExecutionResult } from './types.js';
import { nextCronRunAtUsingTime } from './cron.js';
import { InvalidCronExpressionError, InvalidScheduleError, ScheduleActorRequiredError } from './errors.js';
import type { JobHandler, JobHandlerContext } from './types.js';


@Injectable()
export class JobsRepository {
  constructor(private readonly database: Database) {}
  async inSystem<T>(reason: string, fn: () => Promise<T>): Promise<T> { return this.database.withSystemContext(reason, async () => fn()); }
  async isActiveTenantMember(tenantId: string, actorId: string): Promise<boolean> {
    return this.database.tx(async trx => (await trx.run(activeTenantMember, [tenantId, actorId])).length > 0);
  }
  async executeHandler(job: JobRecord, handler: JobHandler): Promise<JobExecutionResult> {
    if (!job.tenantId || !job.actorId) return { status: 'not_executable', reason: 'missing_actor' };
    const context: JobHandlerContext = { jobId: job.id, jobType: job.jobType, tenantId: job.tenantId, actorId: job.actorId, attempt: job.attempts, maxAttempts: job.maxAttempts, scheduleId: job.scheduleId };
    return this.database.withRequestContext({ tenantId: job.tenantId, actorId: job.actorId }, async () => {
      if (!(await this.isActiveTenantMember(job.tenantId!, job.actorId!))) return { status: 'not_executable', reason: 'inactive_actor_membership' };
      await handler(job.payload, context);
      return { status: 'executed' };
    });
  }
  async enqueue(input: { tenantId: string; jobType: string; payload: Record<string, unknown>; runAt: Date; priority: number; maxAttempts: number; idempotencyKey?: string; actorId?: string }): Promise<JobRecord> {
    return this.database.tx(async trx => this.insertJob(trx, input));
  }
  async insertJob(trx: Transaction, input: { tenantId: string; jobType: string; payload: Record<string, unknown>; runAt: Date; priority: number; maxAttempts: number; idempotencyKey?: string; actorId?: string; scheduleId?: string }): Promise<JobRecord> {
    const result = await trx.runGuarded(insertJobRow, [input.tenantId, input.scheduleId ?? null, input.jobType, JSON.stringify(input.payload), input.runAt, input.priority, input.maxAttempts, input.idempotencyKey ?? null, input.actorId ?? null], isJobRecord);
    return result[0]!;
  }
  async claim(workerId: string, limit: number, visibilityTimeoutMs: number): Promise<JobRecord[]> {
    return this.database.tx(async trx => [...await trx.runGuarded(claimJobRows, [limit, workerId, visibilityTimeoutMs], isJobRecord)], { role: 'owner' });
  }
  async succeed(id: string, workerId: string): Promise<void> { await this.database.tx(async trx => { await trx.run(markSucceeded, [id, workerId]); }, { role: 'owner' }); }
  async fail(id: string, workerId: string, error: string, retryAt: Date | null): Promise<void> { await this.database.tx(async trx => { await trx.run(markFailed, [id, workerId, error.slice(0, 4000), retryAt]); }, { role: 'owner' }); }
  async deadLetter(id: string, workerId: string, reason: 'missing_actor' | 'inactive_actor_membership'): Promise<void> { await this.database.tx(async trx => { await trx.run(markDeadLetter, [id, workerId, reason]); }, { role: 'owner' }); }
  async getJob(id: string, tenantId: string): Promise<JobRecord | null> { return this.database.tx(async trx => (await trx.runGuarded(getJobRow, [id, tenantId], isJobRecord))[0] ?? null); }
  async cancel(id: string, tenantId: string): Promise<boolean> { return this.database.tx(async trx => ((await executeTypedCommand(trx, cancelJob, [id, tenantId])) ?? 0) > 0); }
  async upsertSchedule(input: { tenantId: string; name: string; jobType: string; actorId: string; timezone: string; kind: string; cronExpression?: string; intervalSeconds?: number; payload: Record<string, unknown>; priority: number; maxAttempts: number; backoff: { baseMs: number; maxMs: number; multiplier: number }; nextRunAt: Date; createdBy?: string; isEnabled: boolean }): Promise<ScheduleRecord> {
    return this.database.tx(async trx => (await trx.runGuarded(upsertScheduleRow, [input.tenantId,input.name,input.jobType,input.kind,input.cronExpression ?? null,input.intervalSeconds ?? null,JSON.stringify(input.payload),input.priority,input.maxAttempts,input.backoff.baseMs,input.backoff.maxMs,input.backoff.multiplier,input.nextRunAt,input.createdBy ?? null,input.actorId,input.timezone,input.isEnabled], isScheduleRecord))[0]!);
  }
  async getSchedule(id: string, tenantId: string): Promise<ScheduleRecord | null> { return this.database.tx(async trx => (await trx.runGuarded(getScheduleRow, [id, tenantId], isScheduleRecord))[0] ?? null); }
  async setScheduleEnabled(id: string, tenantId: string, enabled: boolean): Promise<void> { await this.database.tx(async trx => { if (enabled) { const schedule = await trx.run(scheduleAdmission, [id, tenantId]); if (schedule[0] && !schedule[0].actorId) throw new ScheduleActorRequiredError(); if (schedule[0]?.disabledReason) throw new InvalidScheduleError('repair the invalid schedule with an authorized upsert before resuming'); } await trx.run(setEnabled, [id, tenantId, enabled]); }); }
  async deleteSchedule(id: string, tenantId: string): Promise<void> { await this.database.tx(async trx => { await trx.run(deleteSchedule, [id, tenantId]); }); }
  async materialize(limit: number): Promise<ScheduleRecord[]> {
    return this.database.tx(async trx => {
      const due = await trx.runGuarded(dueScheduleRows, [limit], isScheduleRecord);
      const materialized: ScheduleRecord[] = [];
      for (const schedule of due) {
        let next: Date;
        if (schedule.kind === 'cron') {
          try {
            next = nextCronRunAtUsingTime(schedule.cronExpression!, () => {
              if (!(schedule.nextRunAt instanceof Date)) throw new TypeError('after.getTime is not a function');
              return schedule.nextRunAt.getTime();
            }, schedule.timezone);
          } catch (error) {
            if (!(error instanceof InvalidCronExpressionError)) throw error;
            await trx.run(disableInvalidSchedule, [schedule.id]);
            continue;
          }
        } else {
          if (!(schedule.nextRunAt instanceof Date)) throw new TypeError('schedule.nextRunAt.getTime is not a function');
          next = new Date(schedule.nextRunAt.getTime() + schedule.intervalSeconds! * 1000);
        }
        if (!(schedule.nextRunAt instanceof Date)) throw new TypeError('schedule.nextRunAt.toISOString is not a function');
        const key = `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`;
        await this.insertJob(trx, { tenantId: schedule.tenantId!, scheduleId: schedule.id, jobType: schedule.jobType, payload: schedule.payload, runAt: schedule.nextRunAt, priority: schedule.priority, maxAttempts: schedule.maxAttempts, idempotencyKey: key, actorId: schedule.actorId! });
        await trx.run(advanceSchedule, [schedule.id, next]);
        materialized.push(schedule);
      }
      return materialized;
    }, { role: 'owner' });
  }
}
