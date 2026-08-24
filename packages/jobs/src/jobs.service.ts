import { Injectable } from '@nestjs/common';
import { DEFAULT_BACKOFF_POLICY, DEFAULT_MAX_ATTEMPTS } from './constants';
import { normalizeBackoff } from './backoff';
import { InvalidJobInputError, InvalidScheduleError } from './errors';
import { JobsRepository } from './jobs.repository';
import { nextCronRunAt, parseCronExpression } from './cron';
import type { EnqueueJobInput, JobRecord, JobsPort, ScheduleRecord, UpsertScheduleInput } from './types';

@Injectable()
export class JobsService implements JobsPort {
  constructor(private readonly repository: JobsRepository) {}
  async enqueue(input: EnqueueJobInput): Promise<JobRecord> {
    if (!input.jobType.trim() || !input.tenantId || (input.runAt && input.delayMs !== undefined) || (input.delayMs !== undefined && input.delayMs < 0)) throw new InvalidJobInputError('jobType, tenantId, and a non-negative exclusive delay/runAt are required');
    return this.repository.inSystem('jobs enqueue one-shot job', () => this.repository.enqueue({ tenantId: input.tenantId, jobType: input.jobType, payload: input.payload ?? {}, runAt: input.runAt ?? new Date(Date.now() + (input.delayMs ?? 0)), priority: input.priority ?? 0, maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}), ...(input.actorId ? { actorId: input.actorId } : {}) }));
  }
  getJob(jobId: string, tenantId: string): Promise<JobRecord | null> { return this.repository.inSystem('jobs read tenant job', () => this.repository.getJob(jobId, tenantId)); }
  cancel(jobId: string, tenantId?: string): Promise<boolean> { if (!tenantId) throw new InvalidJobInputError('tenantId is required'); return this.repository.inSystem('jobs cancel tenant job', () => this.repository.cancel(jobId, tenantId)); }
  async upsertSchedule(input: UpsertScheduleInput): Promise<ScheduleRecord> {
    if (!input.tenantId || !input.name.trim() || !input.jobType.trim()) throw new InvalidScheduleError('tenantId, name, and jobType are required');
    const now = new Date(); let nextRunAt: Date;
    if (input.kind === 'cron' && input.cronExpression && !input.intervalSeconds) { parseCronExpression(input.cronExpression); nextRunAt = nextCronRunAt(input.cronExpression, now); }
    else if (input.kind === 'interval' && Number.isInteger(input.intervalSeconds) && input.intervalSeconds! > 0 && !input.cronExpression) nextRunAt = new Date(now.getTime() + input.intervalSeconds! * 1000);
    else throw new InvalidScheduleError('cron requires cronExpression; interval requires positive intervalSeconds');
    return this.repository.inSystem('jobs upsert recurring schedule', () => this.repository.upsertSchedule({ tenantId: input.tenantId, name: input.name, jobType: input.jobType, kind: input.kind, ...(input.cronExpression ? { cronExpression: input.cronExpression } : {}), ...(input.intervalSeconds ? { intervalSeconds: input.intervalSeconds } : {}), payload: input.payload ?? {}, priority: input.priority ?? 0, maxAttempts: input.maxAttempts ?? DEFAULT_MAX_ATTEMPTS, backoff: normalizeBackoff(input.backoff ?? {}, DEFAULT_BACKOFF_POLICY), nextRunAt, ...(input.createdBy ? { createdBy: input.createdBy } : {}), isEnabled: input.isEnabled ?? true }));
  }
  getSchedule(id: string, tenantId?: string): Promise<ScheduleRecord | null> { if (!tenantId) throw new InvalidScheduleError('tenantId is required'); return this.repository.inSystem('jobs read tenant schedule', () => this.repository.getSchedule(id, tenantId)); }
  pauseSchedule(id: string, tenantId?: string): Promise<void> { if (!tenantId) throw new InvalidScheduleError('tenantId is required'); return this.repository.inSystem('jobs pause tenant schedule', () => this.repository.setScheduleEnabled(id, tenantId, false)); }
  resumeSchedule(id: string, tenantId?: string): Promise<void> { if (!tenantId) throw new InvalidScheduleError('tenantId is required'); return this.repository.inSystem('jobs resume tenant schedule', () => this.repository.setScheduleEnabled(id, tenantId, true)); }
  deleteSchedule(id: string, tenantId?: string): Promise<void> { if (!tenantId) throw new InvalidScheduleError('tenantId is required'); return this.repository.inSystem('jobs delete tenant schedule', () => this.repository.deleteSchedule(id, tenantId)); }
  readonly defaultBackoff = DEFAULT_BACKOFF_POLICY;
}
