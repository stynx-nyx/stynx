import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DEFAULT_BACKOFF_POLICY, DEFAULT_VISIBILITY_TIMEOUT_MS, DEFAULT_WORKER_BATCH_SIZE } from './constants';
import { computeBackoffMs } from './backoff';
import { JobsRegistry } from './jobs.registry';
import { JobsRepository } from './jobs.repository';
import type { JobRecord, WorkerOptions } from './types';

@Injectable()
export class JobsWorker implements OnModuleInit, OnModuleDestroy {
  private readonly workerId: string;
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly repository: JobsRepository, private readonly registry: JobsRegistry, options: WorkerOptions = {}) { this.workerId = options.workerId ?? `jobs-${randomUUID()}`; this.options = options; }
  private readonly options: WorkerOptions;
  start(): void { if (this.options.enabled === false || this.timer) return; this.timer = setInterval(() => { void this.tick(); }, this.options.pollIntervalMs ?? 2_000); this.timer.unref(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  onModuleInit(): void { this.start(); }
  onModuleDestroy(): void { this.stop(); }
  async tick(): Promise<number> {
    return this.repository.inSystem('jobs worker claim and execute', async () => {
      const jobs = await this.repository.claim(this.workerId, this.options.batchSize ?? DEFAULT_WORKER_BATCH_SIZE, this.options.visibilityTimeoutMs ?? DEFAULT_VISIBILITY_TIMEOUT_MS);
      await Promise.all(jobs.map(job => this.execute(job)));
      return jobs.length;
    });
  }
  private async execute(job: JobRecord): Promise<void> {
    try {
      const handler = this.registry.get(job.jobType);
      await this.repository.executeHandler(job, handler);
      await this.repository.succeed(job.id, this.workerId);
    } catch (error) {
      const retryAt = job.attempts >= job.maxAttempts ? null : new Date(Date.now() + computeBackoffMs(DEFAULT_BACKOFF_POLICY, job.attempts));
      await this.repository.fail(job.id, this.workerId, error instanceof Error ? error.message : String(error), retryAt);
    }
  }
}
