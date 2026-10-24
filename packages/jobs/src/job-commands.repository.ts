import { defineQuery, sql } from '@stynx-nyx/data';
import { z } from 'zod';

const text = z.string();
const uuid = text.regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);

export const activeTenantMember = defineQuery({
  name: 'jobs.activeTenantMember',
  text: sql`select 1 from auth.memberships where tenant_id=$1::uuid and user_id=$2::uuid and is_active=true limit 1`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ '?column?': z.literal(1) }),
  expects: 'many',
});

export const markSucceeded = defineQuery({
  name: 'jobs.markSucceeded',
  text: sql`update jobs.jobs set status='succeeded', locked_by=null, locked_until=null, finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=$1::uuid and locked_by=$2 and status='running'`,
  params: z.tuple([uuid, text]),
  row: z.object({}),
  expects: 'none',
});

export const markFailed = defineQuery({
  name: 'jobs.markFailed',
  text: sql`update jobs.jobs set status=case when $4::timestamptz is null then 'dead_letter'::jobs.job_status else 'pending'::jobs.job_status end, run_at=coalesce($4::timestamptz,run_at), locked_by=null, locked_until=null, finished_at=case when $4::timestamptz is null then clock_timestamp() else null end, last_error=$3, dead_letter_reason=case when $4::timestamptz is null then $3 else null end, updated_at=clock_timestamp() where id=$1::uuid and locked_by=$2 and status='running'`,
  params: z.tuple([uuid, text, text, z.instanceof(Date).nullable()]),
  row: z.object({}),
  expects: 'none',
});

export const markDeadLetter = defineQuery({
  name: 'jobs.markDeadLetter',
  text: sql`update jobs.jobs set status='dead_letter', locked_by=null, locked_until=null, finished_at=clock_timestamp(), dead_letter_reason=$3, updated_at=clock_timestamp() where id=$1::uuid and locked_by=$2 and status='running'`,
  params: z.tuple([uuid, text, text]),
  row: z.object({}),
  expects: 'none',
});

export const cancelJob = defineQuery({
  name: 'jobs.cancelJob',
  text: sql`update jobs.jobs set status='canceled', finished_at=clock_timestamp(), updated_at=clock_timestamp() where id=$1::uuid and tenant_id=$2::uuid and status in ('pending','running')`,
  params: z.tuple([uuid, uuid]),
  row: z.object({}),
  expects: 'none',
});

export const scheduleAdmission = defineQuery({
  name: 'jobs.scheduleAdmission',
  text: sql`select actor_id as "actorId", disabled_reason as "disabledReason" from jobs.schedules where id=$1::uuid and tenant_id=$2::uuid for update`,
  params: z.tuple([uuid, uuid]),
  row: z.object({ actorId: uuid.nullable(), disabledReason: text.nullable() }),
  expects: 'many',
});

export const setEnabled = defineQuery({
  name: 'jobs.setEnabled',
  text: sql`update jobs.schedules set is_enabled=$3, updated_at=clock_timestamp() where id=$1::uuid and tenant_id=$2::uuid`,
  params: z.tuple([uuid, uuid, z.boolean()]),
  row: z.object({}),
  expects: 'none',
});

export const deleteSchedule = defineQuery({
  name: 'jobs.deleteSchedule',
  text: sql`delete from jobs.schedules where id=$1::uuid and tenant_id=$2::uuid`,
  params: z.tuple([uuid, uuid]),
  row: z.object({}),
  expects: 'none',
});

export const disableInvalidSchedule = defineQuery({
  name: 'jobs.disableInvalidSchedule',
  text: sql`update jobs.schedules set is_enabled=false, disabled_reason='invalid_schedule', updated_at=clock_timestamp() where id=$1::uuid`,
  params: z.tuple([uuid]),
  row: z.object({}),
  expects: 'none',
});

export const advanceSchedule = defineQuery({
  name: 'jobs.advanceSchedule',
  text: sql`update jobs.schedules set next_run_at=$2,last_enqueued_at=clock_timestamp(),updated_at=clock_timestamp() where id=$1::uuid`,
  params: z.tuple([uuid, z.instanceof(Date)]),
  row: z.object({}),
  expects: 'none',
});

