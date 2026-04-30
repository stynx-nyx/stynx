import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  STYNX_SLA_CATEGORY_RESOLVER,
  STYNX_SLA_EVENT_SINK,
  STYNX_SLA_OPTIONS,
} from './constants';
import { DefaultSlaCategoryResolver } from './default-sla-category.resolver';
import { LoggerSlaEventSink } from './logger-sla-event.sink';
import { SlaMonitorInterceptor } from './sla-monitor.interceptor';
import type {
  SlaCategoryResolver,
  SlaEventSink,
  SlaMonitorInterceptorOptions,
} from './types';

export interface StynxSlaModuleOptions extends SlaMonitorInterceptorOptions {
  categoryResolver?: SlaCategoryResolver;
  sink?: SlaEventSink;
}

@Module({})
export class StynxSlaModule {
  static forRoot(options: StynxSlaModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_SLA_OPTIONS, useValue: options },
      {
        provide: STYNX_SLA_CATEGORY_RESOLVER,
        useValue: options.categoryResolver ?? new DefaultSlaCategoryResolver(),
      },
      {
        provide: STYNX_SLA_EVENT_SINK,
        useValue: options.sink ?? new LoggerSlaEventSink(),
      },
      {
        provide: SlaMonitorInterceptor,
        useFactory: (
          providedOptions: StynxSlaModuleOptions,
          categoryResolver: SlaCategoryResolver,
          sink: SlaEventSink,
        ) =>
          new SlaMonitorInterceptor(
            providedOptions,
            categoryResolver,
            sink,
          ),
        inject: [
          STYNX_SLA_OPTIONS,
          STYNX_SLA_CATEGORY_RESOLVER,
          STYNX_SLA_EVENT_SINK,
        ],
      },
    ];

    return {
      module: StynxSlaModule,
      providers,
      exports: providers,
    };
  }
}
