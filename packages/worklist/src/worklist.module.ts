import { DynamicModule, Module, type Provider } from '@nestjs/common';
import {
  NoopWorklistEventSink,
  SystemWorklistClock,
  WORKLIST_BUSINESS_CALENDAR,
  WORKLIST_CLOCK,
  WORKLIST_EVENT_SINK,
  WORKLIST_SCHEDULER,
  type WorklistModuleOptions,
} from './ports';
import { WorklistStrategyRegistry } from './strategies';
import { WorklistItemsService } from './worklist-items.service';
import { WorklistQueuesService } from './worklist-queues.service';
import { WorklistSlaService } from './worklist-sla.service';

@Module({})
export class StynxWorklistModule {
  static forRoot(options: WorklistModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: WORKLIST_BUSINESS_CALENDAR,
        useValue: options.calendar ?? null,
      },
      {
        provide: WORKLIST_SCHEDULER,
        useValue: options.scheduler ?? null,
      },
      {
        provide: WORKLIST_EVENT_SINK,
        useValue: options.eventSink ?? new NoopWorklistEventSink(),
      },
      {
        provide: WORKLIST_CLOCK,
        useValue: options.clock ?? new SystemWorklistClock(),
      },
      {
        provide: WorklistStrategyRegistry,
        useFactory: () => new WorklistStrategyRegistry(options.strategies ?? []),
      },
      WorklistQueuesService,
      WorklistItemsService,
      WorklistSlaService,
    ];

    return {
      module: StynxWorklistModule,
      providers,
      exports: [
        WorklistStrategyRegistry,
        WorklistQueuesService,
        WorklistItemsService,
        WorklistSlaService,
        WORKLIST_BUSINESS_CALENDAR,
        WORKLIST_SCHEDULER,
        WORKLIST_EVENT_SINK,
        WORKLIST_CLOCK,
      ],
    };
  }
}
