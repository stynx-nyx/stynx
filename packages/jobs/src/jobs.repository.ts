import { Injectable } from '@nestjs/common';
import { Database } from '@stynx-nyx/data';
import type { Transaction } from '@stynx-nyx/data';
import type { JobRecord, ScheduleRecord, JobExecutionResult } from './types';
import { nextCronRunAt } from './cron';
import { InvalidCronExpressionError, InvalidScheduleError, ScheduleActorRequiredError } from './errors';
import type { JobHandler, JobHandlerContext } from './types';

const JOB_COLUMNS = `id, tenant_id as "tenantId", schedule_id as "scheduleId", job_type as "jobType", payload, status, priority, attempts, max_attempts as "maxAttempts", run_at as "runAt", locked_by as "lockedBy", locked_until as "lockedUntil", started_at as "startedAt", finished_at as "finishedAt", last_error as "lastError", dead_letter_reason as "deadLetterReason", idempotency_key as "idempotencyKey", actor_id as "actorId", created_at as "createdAt", updated_at as "updatedAt"`;
const SCHEDULE_COLUMNS = `id, tenant_id as "tenantId", name, job_type as "jobType", kind, actor_id as "actorId", timezone, cron_expression as "cronExpression", interval_seconds as "intervalSeconds", payload, priority, max_attempts as "maxAttempts", jsonb_build_object('baseMs', backoff_base_ms, 'maxMs', backoff_max_ms, 'multiplier', backoff_multiplier) as backoff, is_enabled as "isEnabled", disabled_reason as "disabledReason", next_run_at as "nextRunAt", last_enqueued_at as "lastEnqueuedAt", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"`;

@Injectable()
export class JobsRepository {
  constructor(private readonly database: Database) {}
  async inSystem<T>(reason: string, fn: () => Promise<T>): Promise<T> { return this.database.withSystemContext(reason, async () => fn()); }
  async isActiveTenantMember(tenantId: string, actorId: string): Promise<boolean> {
    return this.database.tx(async trx => (await trx.query(`select 1 from auth.memberships where tenant_id=$1::uuid and user_id=$2::uuid and is_active=true limit 1`, [tenantId, actorId])).rows.length > 0);
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
    const result = await trx.query<JobRecord>(`insert into jobs.jobs (tenant_id, schedule_id, job_type, payload, run_at, priority, max_attempts, idempotency_key, actor_id) values ($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6,$7,$8,$9::uuid) on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do update set updated_at = clock_timestamp() returning ${JOB_COLUMNS}`, [input.tenantId, input.scheduleId ?? null, input.jobType, JSON.stringify(input.payload), input.runAt, input.priority, input.maxAttempts, input.idempotencyKey ?? null, input.actorId ?? null]);
    return result.rows[0]!;
  }
  async claim(workerId: string, limit: number, visibilityTimeoutMs: number): Promise<JobRecord[]> {
    return this.database.tx(async trx => (await trx.query<JobRecord>(`with due as (select id as due_id from jobs.jobs where (status = 'pending' and run_at <= clock_timestamp()) or (status = 'running' and locked_until <= clock_timestamp()) order by priority desc, run_at asc limit $1 for update skip locked) update jobs.jobs j set status = 'running', attempts = j.attempts + 1, locked_by = $2, locked_until = clock_timestamp() + ($3::text || ' milliseconds')::interval, started_at = coalesce(j.started_at, clock_timestamp()), updated_at = clock_timestamp() from due where j.id = due.due_id returning ${JOB_COLUMNS}`, [limit, workerId, visibilityTimeoutMs])).rows, { role: 'owner' });
  }
  async succeed(id: string, workerId: string): Promise<void> { await this.database.tx(async trx => { await trx.query(`update jobs.jobs set status='succeeded', locked_by=null, locked_until=null, finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=$1::uuid and locked_by=$2 and status='running'`, [id, workerId]); }, { role: 'owner' }); }
  async fail(id: string, workerId: string, error: string, retryAt: Date | null): Promise<void> { await this.database.tx(async trx => { await trx.query(`update jobs.jobs set status=case when $4::timestamptz is null then 'dead_letter'::jobs.job_status else 'pending'::jobs.job_status end, run_at=coalesce($4::timestamptz,run_at), locked_by=null, locked_until=null, finished_at=case when $4::timestamptz is null then clock_timestamp() else null end, last_error=$3, dead_letter_reason=case when $4::timestamptz is null then $3 else null end, updated_at=clock_timestamp() where id=$1::uuid and locked_by=$2 and status='running'`, [id, workerId, error.slice(0, 4000), retryAt]); }, { role: 'owner' }); }
  async deadLetter(id: string, workerId: string, reason: 'missing_actor' | 'inactive_actor_membership'): Promise<void> { await this.database.tx(async trx => { await trx.query(`update jobs.jobs set status='dead_letter', locked_by=null, locked_until=null, finished_at=clock_timestamp(), dead_letter_reason=$3, updated_at=clock_timestamp() where id=$1::uuid and locked_by=$2 and status='running'`, [id, workerId, reason]); }, { role: 'owner' }); }
  async getJob(id: string, tenantId: string): Promise<JobRecord | null> { return this.database.tx(async trx => (await trx.query<JobRecord>(`select ${JOB_COLUMNS} from jobs.jobs where id=$1::uuid and tenant_id=$2::uuid`, [id, tenantId])).rows[0] ?? null); }
  async cancel(id: string, tenantId: string): Promise<boolean> { return this.database.tx(async trx => ((await trx.query(`update jobs.jobs set status='canceled', finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=$1::uuid and tenant_id=$2::uuid and status in ('pending','running')`, [id, tenantId])).rowCount ?? 0) > 0); }
  async upsertSchedule(input: { tenantId: string; name: string; jobType: string; actorId: string; timezone: string; kind: string; cronExpression?: string; intervalSeconds?: number; payload: Record<string, unknown>; priority: number; maxAttempts: number; backoff: { baseMs: number; maxMs: number; multiplier: number }; nextRunAt: Date; createdBy?: string; isEnabled: boolean }): Promise<ScheduleRecord> {
    return this.database.tx(async trx => (await trx.query<ScheduleRecord>(`insert into jobs.schedules (tenant_id,name,job_type,kind,cron_expression,interval_seconds,payload,priority,max_attempts,backoff_base_ms,backoff_max_ms,backoff_multiplier,next_run_at,created_by,actor_id,timezone,is_enabled) values ($1::uuid,$2,$3,$4::jobs.schedule_kind,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14::uuid,$15::uuid,$16,$17) on conflict (tenant_id,name) do update set job_type=excluded.job_type,actor_id=excluded.actor_id,timezone=excluded.timezone,kind=excluded.kind,cron_expression=excluded.cron_expression,interval_seconds=excluded.interval_seconds,payload=excluded.payload,priority=excluded.priority,max_attempts=excluded.max_attempts,backoff_base_ms=excluded.backoff_base_ms,backoff_max_ms=excluded.backoff_max_ms,backoff_multiplier=excluded.backoff_multiplier,next_run_at=excluded.next_run_at,is_enabled=excluded.is_enabled,disabled_reason=null,updated_at=clock_timestamp() returning ${SCHEDULE_COLUMNS}`, [input.tenantId,input.name,input.jobType,input.kind,input.cronExpression ?? null,input.intervalSeconds ?? null,JSON.stringify(input.payload),input.priority,input.maxAttempts,input.backoff.baseMs,input.backoff.maxMs,input.backoff.multiplier,input.nextRunAt,input.createdBy ?? null,input.actorId,input.timezone,input.isEnabled])).rows[0]!);
  }
  async getSchedule(id: string, tenantId: string): Promise<ScheduleRecord | null> { return this.database.tx(async trx => (await trx.query<ScheduleRecord>(`select ${SCHEDULE_COLUMNS} from jobs.schedules where id=$1::uuid and tenant_id=$2::uuid`, [id, tenantId])).rows[0] ?? null); }
  async setScheduleEnabled(id: string, tenantId: string, enabled: boolean): Promise<void> { await this.database.tx(async trx => { if (enabled) { const schedule = await trx.query<{ actorId: string | null; disabledReason: string | null }>(`select actor_id as "actorId", disabled_reason as "disabledReason" from jobs.schedules where id=$1::uuid and tenant_id=$2::uuid for update`, [id, tenantId]); if (schedule.rows[0] && !schedule.rows[0].actorId) throw new ScheduleActorRequiredError(); if (schedule.rows[0]?.disabledReason) throw new InvalidScheduleError('repair the invalid schedule with an authorized upsert before resuming'); } await trx.query(`update jobs.schedules set is_enabled=$3, updated_at=clock_timestamp() where id=$1::uuid and tenant_id=$2::uuid`, [id, tenantId, enabled]); }); }
  async deleteSchedule(id: string, tenantId: string): Promise<void> { await this.database.tx(async trx => { await trx.query(`delete from jobs.schedules where id=$1::uuid and tenant_id=$2::uuid`, [id, tenantId]); }); }
  async materialize(limit: number): Promise<ScheduleRecord[]> {
    return this.database.tx(async trx => {
      const due = await trx.query<ScheduleRecord>(`select ${SCHEDULE_COLUMNS} from jobs.schedules where is_enabled and actor_id is not null and next_run_at <= clock_timestamp() order by next_run_at asc limit $1 for update skip locked`, [limit]);
      const materialized: ScheduleRecord[] = [];
      for (const schedule of due.rows) {
        let next: Date;
        if (schedule.kind === 'cron') {
          try {
            next = nextCronRunAt(schedule.cronExpression!, schedule.nextRunAt, schedule.timezone);
          } catch (error) {
            if (!(error instanceof InvalidCronExpressionError)) throw error;
            await trx.query(`update jobs.schedules set is_enabled=false, disabled_reason='invalid_schedule', updated_at=clock_timestamp() where id=$1::uuid`, [schedule.id]);
            continue;
          }
        } else {
          next = new Date(schedule.nextRunAt.getTime() + schedule.intervalSeconds! * 1000);
        }
        const key = `schedule:${schedule.id}:${schedule.nextRunAt.toISOString()}`;
        await this.insertJob(trx, { tenantId: schedule.tenantId!, scheduleId: schedule.id, jobType: schedule.jobType, payload: schedule.payload, runAt: schedule.nextRunAt, priority: schedule.priority, maxAttempts: schedule.maxAttempts, idempotencyKey: key, actorId: schedule.actorId! });
        await trx.query(`update jobs.schedules set next_run_at=$2,last_enqueued_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1::uuid`, [schedule.id, next]);
        materialized.push(schedule);
      }
      return materialized;
    }, { role: 'owner' });
  }
}
