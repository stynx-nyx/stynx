import { type DynamicModule, Module } from '@nestjs/common';
import { StynxEventStreamService } from './event-stream.service.js';
import { STYNX_SSE_CONTEXT_RUNNER, STYNX_SSE_METRICS, STYNX_SSE_SCHEDULER } from './tokens.js';
import type { EventStreamContextRunner, EventStreamMetricsSink, EventStreamScheduler } from './types.js';

export interface StynxEventStreamModuleOptions {
  contextRunner: EventStreamContextRunner;
  scheduler?: EventStreamScheduler;
  metrics?: EventStreamMetricsSink;
}

@Module({})
export class StynxEventStreamModule {
  static forRoot(options: StynxEventStreamModuleOptions): DynamicModule {
    return {
      module: StynxEventStreamModule,
      providers: [
        { provide: STYNX_SSE_CONTEXT_RUNNER, useValue: options.contextRunner },
        {
          provide: STYNX_SSE_SCHEDULER,
          useFactory: (): EventStreamScheduler => options.scheduler ?? {
            every: (periodMs, tick) => {
              const timer = setInterval(tick, periodMs);
              return { cancel: () => clearInterval(timer) };
            },
          },
        },
        { provide: STYNX_SSE_METRICS, useValue: options.metrics },
        {
          provide: StynxEventStreamService,
          useFactory: (
            contextRunner: EventStreamContextRunner,
            scheduler: EventStreamScheduler,
            metrics?: EventStreamMetricsSink,
          ) => new StynxEventStreamService(contextRunner, scheduler, metrics),
          inject: [STYNX_SSE_CONTEXT_RUNNER, STYNX_SSE_SCHEDULER, STYNX_SSE_METRICS],
        },
      ],
      exports: [StynxEventStreamService, STYNX_SSE_CONTEXT_RUNNER, STYNX_SSE_SCHEDULER, STYNX_SSE_METRICS],
    };
  }
}
