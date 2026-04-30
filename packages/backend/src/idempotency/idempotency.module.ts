import { DynamicModule, Module, Provider } from '@nestjs/common';
import { STYNX_IDEMPOTENCY_OPTIONS, STYNX_IDEMPOTENCY_STORE } from './constants';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import type { IdempotencyInterceptorOptions, IdempotencyStore } from './types';

export interface StynxIdempotencyModuleOptions extends IdempotencyInterceptorOptions {
  store?: IdempotencyStore;
}

@Module({})
export class StynxIdempotencyModule {
  static forRoot(options: StynxIdempotencyModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_IDEMPOTENCY_OPTIONS, useValue: options },
      {
        provide: IdempotencyInterceptor,
        useFactory: (
          providedOptions: StynxIdempotencyModuleOptions,
          store?: IdempotencyStore,
        ) => new IdempotencyInterceptor(providedOptions, store),
        inject: [STYNX_IDEMPOTENCY_OPTIONS, STYNX_IDEMPOTENCY_STORE],
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
        useValue: undefined,
      });
    }

    return {
      module: StynxIdempotencyModule,
      providers,
      exports: providers,
    };
  }
}
