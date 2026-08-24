import { type DynamicModule, Module } from '@nestjs/common';
import { InMemoryOfflineSyncStore } from './in-memory-offline-sync.store';
import { OfflineSyncController } from './offline-sync.controller';
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
    return {
      module: StynxOfflineSyncModule,
      ...(options.mountControllers === false ? {} : { controllers: [OfflineSyncController] }),
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
