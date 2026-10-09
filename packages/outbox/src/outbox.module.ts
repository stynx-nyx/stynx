import { DynamicModule, Module, type Provider } from '@nestjs/common';
import {
  STYNX_OUTBOX_BACKOFF_POLICY,
  STYNX_OUTBOX_DESTINATIONS,
  STYNX_OUTBOX_DISPATCHER,
  STYNX_OUTBOX_METRICS,
  STYNX_OUTBOX_OPTIONS,
} from './constants';
import { OutboxService } from './outbox.service';
import type { OutboxModuleOptions } from './types';

@Module({})
export class StynxOutboxModule {
  static forRoot(options: OutboxModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_OUTBOX_OPTIONS, useValue: options },
      OutboxService,
    ];

    if (options.dispatcher) {
      providers.push({ provide: STYNX_OUTBOX_DISPATCHER, useValue: options.dispatcher });
    }
    if (options.backoffPolicy) {
      providers.push({ provide: STYNX_OUTBOX_BACKOFF_POLICY, useValue: options.backoffPolicy });
    }
    if (options.metrics) {
      providers.push({ provide: STYNX_OUTBOX_METRICS, useValue: options.metrics });
    }
    if (options.destinations) {
      // Per-destination dispatchers travel with their registry; a host may replace this
      // provider (for example with a factory that builds the ports through DI).
      providers.push({ provide: STYNX_OUTBOX_DESTINATIONS, useValue: options.destinations });
    }

    return {
      module: StynxOutboxModule,
      providers,
      exports: [OutboxService],
    };
  }
}
