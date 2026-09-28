import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DEFAULT_BACKOFF_POLICY, DEFAULT_VISIBILITY_TIMEOUT_MS, DEFAULT_WORKER_BATCH_SIZE } from './constants';
import { computeBackoffMs } from './backoff';
import { JobsRegistry } from './jobs.registry';
import { JobsRepository } from './jobs.repository';
import type { JobExecutionResult, JobRecord, TimerHandle, TimerPort, WorkerOptions } from './types';

const nativeTimer: TimerPort = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly workerId: string;
  private readonly options: WorkerOptions;
  private timer: TimerHandle | undefined;
  private ticking = false;

  constructor(private readonly repository: JobsRepository, private readonly registry: JobsRegistry, options: WorkerOptions = {}) {
    this.workerId = options.workerId ?? `jobs-${randomUUID()}`;
    this.options = options;
  }

  start(): void {
    if (this.options.enabled === false || this.timer) return;
    const timerPort = this.options.timer ?? nativeTimer;
    const handle = timerPort.setInterval(() => {
      if (this.timer !== handle || this.ticking) return;
      this.ticking = true;
      void this.tick().catch(() => undefined).finally(() => { this.ticking = false; });
    }, this.options.pollIntervalMs ?? 2_000);
    this.timer = handle;
    handle.unref?.();
  }

  stop(): void {
    if (this.timer) (this.options.timer ?? nativeTimer).clearInterval(this.timer);
    this.timer = undefined;
  }

  onModuleInit(): void { this.start(); }
  onModuleDestroy(): void { this.stop(); }

  async tick(): Promise<number> {
    const jobs = await this.repository.inSystem('jobs worker claim due jobs', () =>
      this.repository.claim(
        this.workerId,
        this.options.batchSize ?? DEFAULT_WORKER_BATCH_SIZE,
        this.options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS,
      ),
    );
    await Promise.all(jobs.map(job => this.execute(job)));
    return jobs.length;
  }

  private async execute(job: JobRecord): Promise<void> {
    if (!job.tenantId || !job.actorId) {
      await this.repository.inSystem('jobs worker record job outcome', () =>
        this.repository.deadLetter(job.id, this.workerId, 'missing_actor'));
      return;
    }

    let result: JobExecutionResult;
    try {
      const handler = this.registry.get(job.jobType);
      result = await this.repository.executeHandler(job, handler);
    } catch (error) {
      const retryAt = job.attempts >= job.maxAttempts
        ? null
        : new Date((this.options.clock?.now() ?? Date.now()) + computeBackoffMs(DEFAULT_BACKOFF_POLICY, job.attempts));
      await this.repository.inSystem('jobs worker record job outcome', () =>
        this.repository.fail(job.id, this.workerId, error instanceof Error ? error.message : String(error), retryAt));
      return;
    }

    if (result.status === 'not_executable') {
      await this.repository.inSystem('jobs worker record job outcome', () =>
        this.repository.deadLetter(job.id, this.workerId, result.reason));
      return;
    }

    await this.repository.inSystem('jobs worker record job outcome', () =>
      this.repository.succeed(job.id, this.workerId));
  }
}
