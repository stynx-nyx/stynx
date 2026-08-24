import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_SCHEDULER_BATCH_SIZE } from './constants';
import { JobsRepository } from './jobs.repository';
import type { SchedulerOptions } from './types';

@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | undefined;
  constructor(private readonly repository: JobsRepository, private readonly options: SchedulerOptions = {}) {}
  async tick(): Promise<number> { return this.repository.inSystem('jobs scheduler materialize due schedules', async () => (await this.repository.materialize(this.options.batchSize ?? DEFAULT_SCHEDULER_BATCH_SIZE)).length); }
  start(): void { if (this.options.enabled === false || this.timer) return; this.timer = setInterval(() => { void this.tick(); }, this.options.pollIntervalMs ?? 5_000); this.timer.unref(); }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  onModuleInit(): void { this.start(); }
  onModuleDestroy(): void { this.stop(); }
}
