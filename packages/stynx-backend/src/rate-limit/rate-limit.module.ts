import { DynamicModule, Module, Provider } from '@nestjs/common';
import { STYNX_RATE_LIMIT_OPTIONS, STYNX_RATE_LIMIT_STORE } from './constants';
import { RateLimitGuard } from './rate-limit.guard';
import type { RateLimitGuardOptions, RateLimitStore } from './types';

export interface StynxRateLimitModuleOptions extends RateLimitGuardOptions {
  store?: RateLimitStore;
}

@Module({})
export class StynxRateLimitModule {
  static forRoot(options: StynxRateLimitModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: STYNX_RATE_LIMIT_OPTIONS,
        useValue: options,
      },
      {
        provide: RateLimitGuard,
        useFactory: (
          providedOptions: StynxRateLimitModuleOptions,
          store?: RateLimitStore,
        ) => new RateLimitGuard(providedOptions, store),
        inject: [STYNX_RATE_LIMIT_OPTIONS, STYNX_RATE_LIMIT_STORE],
      },
    ];

    if (options.store) {
      providers.push({
        provide: STYNX_RATE_LIMIT_STORE,
        useValue: options.store,
      });
    } else {
      providers.push({
        provide: STYNX_RATE_LIMIT_STORE,
        useValue: undefined,
      });
    }

    return {
      module: StynxRateLimitModule,
      providers,
      exports: providers,
    };
  }
}
