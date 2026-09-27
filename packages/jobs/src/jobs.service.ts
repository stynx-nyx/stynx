import { Injectable } from '@nestjs/common';
import { RequestContext } from '@stynx-nyx/core';
import { ActorContextMissingError, TenantContextMissingError } from '@stynx-nyx/data';
import { DEFAULT_BACKOFF_POLICY, DEFAULT_MAX_ATTEMPTS } from './constants';
import { normalizeBackoff } from './backoff';
import { InvalidJobInputError, InvalidScheduleError, JobActorAssignmentDeniedError, JobActorMembershipError, JobTenantMismatchError, ScheduleActorRequiredError } from './errors';
import { JobsRepository } from './jobs.repository';
import { nextCronRunAt, parseCronExpression } from './cron';
import type { EnqueueJobInput, JobRecord, JobsPort, ScheduleRecord, StynxJobsModuleOptions, UpsertScheduleInput } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

function canonicalTimezone(value: string): string {
  // Bare abbreviations and numeric offsets are ambiguous and depend on host tzdata.
  if ((value !== 'UTC' && !value.includes('/')) || /^Etc\/GMT[+-]/u.test(value)) throw new InvalidScheduleError('timezone must be a canonical IANA name');
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: value }).resolvedOptions().timeZone;
  } catch {
    throw new InvalidScheduleError('timezone must be a canonical IANA name');
  }
}

@Injectable()
export class JobsService implements JobsPort {
  constructor(
    private readonly repository: JobsRepository,
    private readonly requestContext: RequestContext,
    private readonly options: StynxJobsModuleOptions,
  ) {}

  private caller(tenantId: string): { tenantId: string; actorId: string } {
    const context = this.requestContext.snapshot();
    if (!context.tenantId) throw new TenantContextMissingError();
    if (!context.actorId) throw new ActorContextMissingError();
    if (tenantId !== context.tenantId) throw new JobTenantMismatchError(tenantId, context.tenantId);
    return { tenantId: context.tenantId, actorId: context.actorId };
  }

  private async authorizeActor(tenantId: string, actorId: string, callerActorId: string): Promise<void> {
    if (!(await this.repository.isActiveTenantMember(tenantId, actorId))) throw new JobActorMembershipError(tenantId, actorId);
    if (actorId !== callerActorId) {
      const allowed = await this.options.authorizeTechnicalActor?.({ tenantId, callerActorId, technicalActorId: actorId, permission: 'jobs.assignTechnicalActor' });
      if (allowed !== true) throw new JobActorAssignmentDeniedError(tenantId, actorId);
    }
  }

  async enqueue(input: EnqueueJobInput): Promise<JobRecord> {
    if (!input.jobType?.trim() || !input.tenantId || (input.runAt && input.delayMs !== undefined) || (input.delayMs !== undefined && input.delayMs < 0)) throw new InvalidJobInputError('jobType, tenantId, and a non-negative exclusive delay/runAt are required');
    if (input.actorId === '') throw new InvalidJobInputError('actorId is required');
    if (input.actorId !== undefined && !UUID_PATTERN.test(input.actorId)) throw new InvalidJobInputError('actorId must be a UUID');
    const caller = this.caller(input.tenantId);
    const actorId = input.actorId ?? caller.actorId;
    await this.authorizeActor(input.tenantId, actorId, caller.actorId);
    return this.repository.enqueue({ tenantId: input.tenantId, jobType: input.jobType, payload: input.payload ?? {}, runAt: input.runAt ?? new Date(Date.now() + (input.delayMs ?? 0)), priority: input.priority ?? 0, maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}), actorId });
  }

  getJob(jobId: string, tenantId?: string): Promise<JobRecord | null> {
    if (!tenantId) throw new InvalidJobInputError('tenantId is required');
    return Promise.resolve().then(() => { this.caller(tenantId); return this.repository.getJob(jobId, tenantId); });
  }

  cancel(jobId: string, tenantId?: string): Promise<boolean> {
    if (!tenantId) throw new InvalidJobInputError('tenantId is required');
    return Promise.resolve().then(() => { this.caller(tenantId); return this.repository.cancel(jobId, tenantId); });
  }

  async upsertSchedule(input: UpsertScheduleInput): Promise<ScheduleRecord> {
    if (!input.tenantId || !input.name?.trim() || !input.jobType?.trim()) throw new InvalidScheduleError('tenantId, name, and jobType are required');
    if (!input.actorId?.trim()) throw new ScheduleActorRequiredError();
    if (!UUID_PATTERN.test(input.actorId)) throw new InvalidScheduleError('actorId must be a UUID');
    const timezone = canonicalTimezone(input.timezone ?? 'UTC');
    const now = new Date(); let nextRunAt: Date;
    if (input.kind === 'cron' && input.cronExpression && !input.intervalSeconds) { parseCronExpression(input.cronExpression); nextRunAt = nextCronRunAt(input.cronExpression, now, timezone); }
    else if (input.kind === 'interval' && Number.isInteger(input.intervalSeconds) && input.intervalSeconds! > 0 && !input.cronExpression) nextRunAt = new Date(now.getTime() + input.intervalSeconds! * 1000);
    else throw new InvalidScheduleError('cron requires cronExpression; interval requires positive intervalSeconds');
    const caller = this.caller(input.tenantId);
    await this.authorizeActor(input.tenantId, input.actorId, caller.actorId);
    return this.repository.upsertSchedule({ tenantId: input.tenantId, name: input.name, jobType: input.jobType, actorId: input.actorId, timezone, kind: input.kind, ...(input.cronExpression ? { cronExpression: input.cronExpression } : {}), ...(input.intervalSeconds ? { intervalSeconds: input.intervalSeconds } : {}), payload: input.payload ?? {}, priority: input.priority ?? 0, maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, backoff: normalizeBackoff(input.backoff ?? {}, DEFAULT_BACKOFF_POLICY), nextRunAt, ...(input.createdBy ? { createdBy: input.createdBy } : {}), isEnabled: input.isEnabled ?? true });
  }

  getSchedule(id: string, tenantId?: string): Promise<ScheduleRecord | null> {
    if (!tenantId) throw new InvalidScheduleError('tenantId is required');
    return Promise.resolve().then(() => { this.caller(tenantId); return this.repository.getSchedule(id, tenantId); });
  }

  pauseSchedule(id: string, tenantId?: string): Promise<void> {
    if (!tenantId) throw new InvalidScheduleError('tenantId is required');
    return Promise.resolve().then(() => { this.caller(tenantId); return this.repository.setScheduleEnabled(id, tenantId, false); });
  }

  resumeSchedule(id: string, tenantId?: string): Promise<void> {
    if (!tenantId) throw new InvalidScheduleError('tenantId is required');
    return Promise.resolve().then(() => { this.caller(tenantId); return this.repository.setScheduleEnabled(id, tenantId, true); });
  }

  deleteSchedule(id: string, tenantId?: string): Promise<void> {
    if (!tenantId) throw new InvalidScheduleError('tenantId is required');
    return Promise.resolve().then(() => { this.caller(tenantId); return this.repository.deleteSchedule(id, tenantId); });
  }

  readonly defaultBackoff = DEFAULT_BACKOFF_POLICY;
}
