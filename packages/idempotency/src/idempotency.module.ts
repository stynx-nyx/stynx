import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_IDEMPOTENCY_BACKEND, STYNX_IDEMPOTENCY_METRICS, STYNX_IDEMPOTENCY_OPTIONS, STYNX_IDEMPOTENCY_STORE } from './constants.js';
import { DatabaseIdempotencyStore } from './database-idempotency.store.js';
import { IdempotencyInterceptor } from './idempotency.interceptor.js';
import { InMemoryIdempotencyMetrics } from './metrics.js';
import { RedisIdempotencyBackend } from './redis-idempotency.backend.js';
import type { IdempotencyBackend, IdempotencyInterceptorOptions, IdempotencyMetricsSink, IdempotencyStore } from './types.js';

export interface StynxIdempotencyModuleOptions extends IdempotencyInterceptorOptions {
  store?: IdempotencyStore;
  backend?: IdempotencyBackend;
  metrics?: IdempotencyMetricsSink;
}

@Module({})
export class StynxIdempotencyModule {
  static forRoot(options: StynxIdempotencyModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_IDEMPOTENCY_OPTIONS, useValue: options },
      RedisIdempotencyBackend,
      DatabaseIdempotencyStore,
      {
        provide: IdempotencyInterceptor,
        useFactory: (
          reflector: Reflector,
          providedOptions: StynxIdempotencyModuleOptions,
          store?: IdempotencyStore,
          backend?: IdempotencyBackend,
          metrics?: IdempotencyMetricsSink,
        ) => new IdempotencyInterceptor(reflector, providedOptions, store, backend, metrics),
        inject: [Reflector, STYNX_IDEMPOTENCY_OPTIONS, STYNX_IDEMPOTENCY_STORE, STYNX_IDEMPOTENCY_BACKEND, STYNX_IDEMPOTENCY_METRICS],
      },
    ];

    if (options.store) {
      providers.push({
        provide: STYNX_IDEMPOTENCY_STORE,
        useValue: options.store,
      });
    } else {
      providers.push({
        provide: STYNX_IDEMPOTENCY_STORE,
        useExisting: DatabaseIdempotencyStore,
      });
    }

    providers.push(
      options.backend
        ? { provide: STYNX_IDEMPOTENCY_BACKEND, useValue: options.backend }
        : { provide: STYNX_IDEMPOTENCY_BACKEND, useExisting: RedisIdempotencyBackend },
    );

    providers.push(
      options.metrics
        ? { provide: STYNX_IDEMPOTENCY_METRICS, useValue: options.metrics }
        : { provide: STYNX_IDEMPOTENCY_METRICS, useClass: InMemoryIdempotencyMetrics },
    );

    return {
      module: StynxIdempotencyModule,
      providers,
      exports: providers,
    };
  }
}
