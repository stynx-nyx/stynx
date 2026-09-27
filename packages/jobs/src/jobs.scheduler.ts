import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { DEFAULT_SCHEDULER_BATCH_SIZE } from './constants';
import { JobsRepository } from './jobs.repository';
import type { SchedulerOptions, TimerHandle, TimerPort } from './types';

const nativeTimer: TimerPort = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

@Injectable()
export class JobsScheduler implements OnModuleInit, OnModuleDestroy {
  private timer: TimerHandle | undefined;
  private ticking = false;

  constructor(private readonly repository: JobsRepository, private readonly options: SchedulerOptions = {}) {}

  async tick(): Promise<number> {
    return this.repository.inSystem('jobs scheduler materialize due schedules', async () =>
      (await this.repository.materialize(this.options.batchSize ?? DEFAULT_SCHEDULER_BATCH_SIZE)).length);
  }

  start(): void {
    if (this.options.enabled === false || this.timer) return;
    const timerPort = this.options.timer ?? nativeTimer;
    const handle = timerPort.setInterval(() => {
      if (this.timer !== handle || this.ticking) return;
      this.ticking = true;
      void this.tick().catch(() => undefined).finally(() => { this.ticking = false; });
    }, this.options.pollIntervalMs ?? 5_000);
    this.timer = handle;
    handle.unref?.();
  }

  stop(): void {
    if (this.timer) (this.options.timer ?? nativeTimer).clearInterval(this.timer);
    this.timer = undefined;
  }

  onModuleInit(): void { this.start(); }
  onModuleDestroy(): void { this.stop(); }
}
