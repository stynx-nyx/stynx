import { type DynamicModule, Module } from '@nestjs/common';
import { InMemoryOfflineSyncStore } from './in-memory-offline-sync.store';
import { OfflineSyncController } from './offline-sync.controller';
import { CTG9OfflineSyncController } from './ctg9-offline-sync.controller';
import { OfflineSyncConfigurationError } from './errors';
import { OfflineSyncService } from './offline-sync.service';
import { PostgresOfflineSyncStore } from './postgres-offline-sync.store';
import { StynxOfflineSyncContext } from './stynx-offline-sync.context';
import {
  STYNX_OFFLINE_SYNC_CONTEXT,
  STYNX_OFFLINE_SYNC_OPTIONS,
  STYNX_OFFLINE_SYNC_STORE,
} from './tokens';
import type { StynxOfflineSyncModuleOptions } from './types';

@Module({})
export class StynxOfflineSyncModule {
  static forRoot(options: StynxOfflineSyncModuleOptions = {}): DynamicModule {
    const ctg9 = options.policyResolver != null;
    if (!ctg9) for (const port of ['itemApplier','eventPort','agentResolver','legacyItemIdentityResolver','legacyIdempotencyStore','handoffPort','concurrencyDetector','conflictResolver'] as const) {
      if (options[port] != null) throw new OfflineSyncConfigurationError(port);
    }
    if (ctg9 && options.itemApplier && !options.eventPort) throw new OfflineSyncConfigurationError('eventPort');
    if (ctg9 && options.store && !['blockNumberingReservation','closeNumberingReservation','reconcileNumberingReservation','settleNumberingReservation','getNumberingConsumption','submitDurableSyncBatch','getSyncBatchReceipt','getSyncItemReceipt'].every(method => typeof (options.store as unknown as Record<string, unknown>)[method] === 'function')) throw new OfflineSyncConfigurationError('store');
    return {
      module: StynxOfflineSyncModule,
      ...(options.mountControllers === false ? {} : { controllers: [ctg9 ? CTG9OfflineSyncController : OfflineSyncController] }),
      providers: [
        { provide: STYNX_OFFLINE_SYNC_OPTIONS, useValue: options },
        ...(options.store
          ? [{ provide: STYNX_OFFLINE_SYNC_STORE, useValue: options.store }]
          : [
              PostgresOfflineSyncStore,
              { provide: STYNX_OFFLINE_SYNC_STORE, useExisting: PostgresOfflineSyncStore },
            ]),
        ...(options.context
          ? [{ provide: STYNX_OFFLINE_SYNC_CONTEXT, useValue: options.context }]
          : [
              StynxOfflineSyncContext,
              { provide: STYNX_OFFLINE_SYNC_CONTEXT, useExisting: StynxOfflineSyncContext },
            ]),
        OfflineSyncService,
      ],
      exports: [OfflineSyncService, STYNX_OFFLINE_SYNC_STORE],
    };
  }

  static inMemory(options: Omit<StynxOfflineSyncModuleOptions, 'store'> = {}): DynamicModule {
    return this.forRoot({ ...options, store: new InMemoryOfflineSyncStore() });
  }
}
