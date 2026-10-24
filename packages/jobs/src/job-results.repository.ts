import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';
import type { BackoffPolicy, JobRecord, JobTimestampResult, ScheduleRecord } from './types.js';
const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const number = z.custom<number>((value) => typeof value === 'number');
const date = z.instanceof(Date);
const timestamp = z.union([date, text, z.custom<number>((value) => value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY)]);
// This field is an opaque public Record<string, unknown>, not a JSON-tree
// normalization boundary. Preserve its own keys, nested values and identity.
const payload = z.custom<Record<string, unknown>>(
  (value): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value),
);
const jobRow = z.object({
 id: uuid, tenantId: uuid.nullable(), scheduleId: uuid.nullable(), jobType: text, payload,
 status: z.enum(['pending', 'running', 'succeeded', 'failed', 'dead_letter', 'canceled']),
 priority: number, attempts: number, maxAttempts: number, runAt: timestamp,
 lockedBy: text.nullable(), lockedUntil: timestamp.nullable(), startedAt: timestamp.nullable(), finishedAt: timestamp.nullable(),
 lastError: text.nullable(), deadLetterReason: text.nullable(), idempotencyKey: text.nullable(), actorId: uuid.nullable(),
 createdAt: timestamp, updatedAt: timestamp,
});
const scheduleRow = z.object({
 id: uuid, tenantId: uuid.nullable(), name: text, jobType: text, kind: z.enum(['cron', 'interval']), actorId: uuid.nullable(),
 timezone: text, cronExpression: text.nullable(), intervalSeconds: number.nullable(), payload,
 priority: number, maxAttempts: number, backoff: z.object({ baseMs: number, maxMs: number, multiplier: number }),
 isEnabled: z.boolean(), disabledReason: text.nullable(), nextRunAt: timestamp, lastEnqueuedAt: timestamp.nullable(),
 createdBy: uuid.nullable(), createdAt: timestamp, updatedAt: timestamp,
});


// The checked executor validates the query schema first. These complete guards
// independently prove the original driver objects so identity-sensitive callers
// can retain them without asserting that parsed output types describe raw rows.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isNullableText(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
function isTimestamp(value: unknown): value is JobTimestampResult {
  return value instanceof Date || typeof value === 'string' ||
    value === Number.POSITIVE_INFINITY || value === Number.NEGATIVE_INFINITY;
}
function isNullableTimestamp(value: unknown): value is JobTimestampResult | null {
  return value === null || isTimestamp(value);
}
function isBackoff(value: unknown): value is BackoffPolicy {
  return isRecord(value) && typeof value.baseMs === 'number' &&
    typeof value.maxMs === 'number' && typeof value.multiplier === 'number';
}
export function isJobRecord(value: unknown): value is JobRecord {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    isNullableText(value.tenantId) &&
    isNullableText(value.scheduleId) &&
    typeof value.jobType === 'string' &&
    isRecord(value.payload) &&
    (value.status === 'pending' || value.status === 'running' ||
      value.status === 'succeeded' || value.status === 'failed' ||
      value.status === 'dead_letter' || value.status === 'canceled') &&
    typeof value.priority === 'number' &&
    typeof value.attempts === 'number' &&
    typeof value.maxAttempts === 'number' &&
    isTimestamp(value.runAt) &&
    isNullableText(value.lockedBy) &&
    isNullableTimestamp(value.lockedUntil) &&
    isNullableTimestamp(value.startedAt) &&
    isNullableTimestamp(value.finishedAt) &&
    isNullableText(value.lastError) &&
    isNullableText(value.deadLetterReason) &&
    isNullableText(value.idempotencyKey) &&
    isNullableText(value.actorId) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt);
}
export function isScheduleRecord(value: unknown): value is ScheduleRecord {
  return isRecord(value) &&
    typeof value.id === 'string' &&
    isNullableText(value.tenantId) &&
    typeof value.name === 'string' &&
    typeof value.jobType === 'string' &&
    (value.kind === 'cron' || value.kind === 'interval') &&
    isNullableText(value.actorId) &&
    typeof value.timezone === 'string' &&
    isNullableText(value.cronExpression) &&
    (value.intervalSeconds === null || typeof value.intervalSeconds === 'number') &&
    isRecord(value.payload) &&
    typeof value.priority === 'number' &&
    typeof value.maxAttempts === 'number' &&
    isBackoff(value.backoff) &&
    typeof value.isEnabled === 'boolean' &&
    isNullableText(value.disabledReason) &&
    isTimestamp(value.nextRunAt) &&
    isNullableTimestamp(value.lastEnqueuedAt) &&
    isNullableText(value.createdBy) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt);
}

export const insertJobRow = defineQuery({
 name: 'jobs.insertJobRow', text: sql`insert into jobs.jobs (tenant_id, schedule_id, job_type, payload, run_at, priority, max_attempts, idempotency_key, actor_id) values ($1::uuid,$2::uuid,$3,$4::jsonb,$5,$6,$7,$8,$9::uuid) on conflict (tenant_id, job_type, idempotency_key) where idempotency_key is not null do update set updated_at = clock_timestamp() returning id, tenant_id as "tenantId", schedule_id as "scheduleId", job_type as "jobType", payload, status, priority, attempts, max_attempts as "maxAttempts", run_at as "runAt", locked_by as "lockedBy", locked_until as "lockedUntil", started_at as "startedAt", finished_at as "finishedAt", last_error as "lastError", dead_letter_reason as "deadLetterReason", idempotency_key as "idempotencyKey", actor_id as "actorId", created_at as "createdAt", updated_at as "updatedAt"`,
 params: z.tuple([uuid, uuid.nullable(), text, text, date, number, number, text.nullable(), uuid.nullable()]), row: jobRow, expects: 'many',
});

export const claimJobRows = defineQuery({
 name: 'jobs.claimJobRows', text: sql`with due as (select id as due_id from jobs.jobs where (status = 'pending' and run_at <= clock_timestamp()) or (status = 'running' and locked_until <= clock_timestamp()) order by priority desc, run_at asc limit $1 for update skip locked) update jobs.jobs j set status = 'running', attempts = j.attempts + 1, locked_by = $2, locked_until = clock_timestamp() + ($3::text || ' milliseconds')::interval, started_at = coalesce(j.started_at, clock_timestamp()), updated_at = clock_timestamp() from due where j.id = due.due_id returning id, tenant_id as "tenantId", schedule_id as "scheduleId", job_type as "jobType", payload, status, priority, attempts, max_attempts as "maxAttempts", run_at as "runAt", locked_by as "lockedBy", locked_until as "lockedUntil", started_at as "startedAt", finished_at as "finishedAt", last_error as "lastError", dead_letter_reason as "deadLetterReason", idempotency_key as "idempotencyKey", actor_id as "actorId", created_at as "createdAt", updated_at as "updatedAt"`,
 params: z.tuple([number, text, number]), row: jobRow, expects: 'many',
});

export const getJobRow = defineQuery({
 name: 'jobs.getJobRow', text: sql`select id, tenant_id as "tenantId", schedule_id as "scheduleId", job_type as "jobType", payload, status, priority, attempts, max_attempts as "maxAttempts", run_at as "runAt", locked_by as "lockedBy", locked_until as "lockedUntil", started_at as "startedAt", finished_at as "finishedAt", last_error as "lastError", dead_letter_reason as "deadLetterReason", idempotency_key as "idempotencyKey", actor_id as "actorId", created_at as "createdAt", updated_at as "updatedAt" from jobs.jobs where id=$1::uuid and tenant_id=$2::uuid`,
 params: z.tuple([uuid, uuid]), row: jobRow, expects: 'many',
});

export const upsertScheduleRow = defineQuery({
 name: 'jobs.upsertScheduleRow', text: sql`insert into jobs.schedules (tenant_id,name,job_type,kind,cron_expression,interval_seconds,payload,priority,max_attempts,backoff_base_ms,backoff_max_ms,backoff_multiplier,next_run_at,created_by,actor_id,timezone,is_enabled) values ($1::uuid,$2,$3,$4::jobs.schedule_kind,$5,$6,$7::jsonb,$8,$9,$10,$11,$12,$13,$14::uuid,$15::uuid,$16,$17) on conflict (tenant_id,name) do update set job_type=excluded.job_type,actor_id=excluded.actor_id,timezone=excluded.timezone,kind=excluded.kind,cron_expression=excluded.cron_expression,interval_seconds=excluded.interval_seconds,payload=excluded.payload,priority=excluded.priority,max_attempts=excluded.max_attempts,backoff_base_ms=excluded.backoff_base_ms,backoff_max_ms=excluded.backoff_max_ms,backoff_multiplier=excluded.backoff_multiplier,next_run_at=excluded.next_run_at,is_enabled=excluded.is_enabled,disabled_reason=null,updated_at=clock_timestamp() returning id, tenant_id as "tenantId", name, job_type as "jobType", kind, actor_id as "actorId", timezone, cron_expression as "cronExpression", interval_seconds as "intervalSeconds", payload, priority, max_attempts as "maxAttempts", jsonb_build_object('baseMs', backoff_base_ms, 'maxMs', backoff_max_ms, 'multiplier', backoff_multiplier) as backoff, is_enabled as "isEnabled", disabled_reason as "disabledReason", next_run_at as "nextRunAt", last_enqueued_at as "lastEnqueuedAt", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt"`,
 params: z.tuple([uuid, text, text, text, text.nullable(), number.nullable(), text, number, number, number, number, number, date, uuid.nullable(), uuid, text, z.boolean()]), row: scheduleRow, expects: 'many',
});

export const getScheduleRow = defineQuery({
 name: 'jobs.getScheduleRow', text: sql`select id, tenant_id as "tenantId", name, job_type as "jobType", kind, actor_id as "actorId", timezone, cron_expression as "cronExpression", interval_seconds as "intervalSeconds", payload, priority, max_attempts as "maxAttempts", jsonb_build_object('baseMs', backoff_base_ms, 'maxMs', backoff_max_ms, 'multiplier', backoff_multiplier) as backoff, is_enabled as "isEnabled", disabled_reason as "disabledReason", next_run_at as "nextRunAt", last_enqueued_at as "lastEnqueuedAt", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt" from jobs.schedules where id=$1::uuid and tenant_id=$2::uuid`,
 params: z.tuple([uuid, uuid]), row: scheduleRow, expects: 'many',
});

export const dueScheduleRows = defineQuery({
 name: 'jobs.dueScheduleRows', text: sql`select id, tenant_id as "tenantId", name, job_type as "jobType", kind, actor_id as "actorId", timezone, cron_expression as "cronExpression", interval_seconds as "intervalSeconds", payload, priority, max_attempts as "maxAttempts", jsonb_build_object('baseMs', backoff_base_ms, 'maxMs', backoff_max_ms, 'multiplier', backoff_multiplier) as backoff, is_enabled as "isEnabled", disabled_reason as "disabledReason", next_run_at as "nextRunAt", last_enqueued_at as "lastEnqueuedAt", created_by as "createdBy", created_at as "createdAt", updated_at as "updatedAt" from jobs.schedules where is_enabled and actor_id is not null and next_run_at <= clock_timestamp() order by next_run_at asc limit $1 for update skip locked`,
 params: z.tuple([number]), row: scheduleRow, expects: 'many',
});
