import { type DynamicModule, Module } from '@nestjs/common';
import { InMemoryOfflineSyncStore } from './in-memory-offline-sync.store.js';
import { OfflineSyncController } from './offline-sync.controller.js';
import { CTG9OfflineSyncController } from './ctg9-offline-sync.controller.js';
import { OfflineSyncConfigurationError } from './errors.js';
import { OfflineSyncService } from './offline-sync.service.js';
import { PostgresOfflineSyncStore } from './postgres-offline-sync.store.js';
import { StynxOfflineSyncContext } from './stynx-offline-sync.context.js';
import {
  STYNX_OFFLINE_SYNC_CONTEXT,
  STYNX_OFFLINE_SYNC_OPTIONS,
  STYNX_OFFLINE_SYNC_STORE,
} from './tokens.js';
import type { StynxOfflineSyncModuleOptions } from './types.js';

// Preserve one ordinary property Get, including primitive boxing and the original receiver.
function readProperty(value: unknown, key: string): unknown {
  if (value === null || value === undefined)
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  const target: unknown = Object(value);
  if ((typeof target === 'object' && target !== null) || typeof target === 'function')
    return Reflect.get(target, key, value);
  throw new TypeError('Property receiver is unavailable');
}

@Module({})
export class StynxOfflineSyncModule {
  static forRoot(options: StynxOfflineSyncModuleOptions = {}): DynamicModule {
    const ctg9 = options.policyResolver != null;
    if (
      options.initialQueueStatus !== undefined &&
      (!ctg9 || !['received', 'pending'].includes(options.initialQueueStatus))
    )
      throw new OfflineSyncConfigurationError('initialQueueStatus');
    if (!ctg9)
      for (const port of [
        'itemApplier',
        'eventPort',
        'agentResolver',
        'legacyItemIdentityResolver',
        'legacyIdempotencyStore',
        'handoffPort',
        'concurrencyDetector',
        'conflictResolver',
        'payloadHashPort',
        'preApplyDetector',
      ] as const) {
        if (options[port] != null) throw new OfflineSyncConfigurationError(port);
      }
    if (ctg9 && options.itemApplier && !options.eventPort)
      throw new OfflineSyncConfigurationError('eventPort');
    if (
      ctg9 &&
      options.store &&
      ![
        'blockNumberingReservation',
        'closeNumberingReservation',
        'reconcileNumberingReservation',
        'settleNumberingReservation',
        'getNumberingConsumption',
        'submitDurableSyncBatch',
        'getSyncBatchReceipt',
        'getSyncItemReceipt',
      ].every(
        (method) =>
          typeof readProperty(options.store, method) === 'function',
      )
    )
      throw new OfflineSyncConfigurationError('store');
    return {
      module: StynxOfflineSyncModule,
      ...(options.mountControllers === false
        ? {}
        : { controllers: [ctg9 ? CTG9OfflineSyncController : OfflineSyncController] }),
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
