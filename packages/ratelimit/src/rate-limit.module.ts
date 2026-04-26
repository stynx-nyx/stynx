import { DynamicModule, Module, type Provider } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STYNX_RATE_LIMIT_METRICS, STYNX_RATE_LIMIT_OPTIONS, STYNX_RATE_LIMIT_POLICY, STYNX_RATE_LIMIT_STORE } from './constants';
import { InMemoryRateLimitMetrics } from './metrics';
import { DatabaseRateLimitPolicyResolver } from './rate-limit-policy.service';
import { RateLimitGuard } from './rate-limit.guard';
import { RedisSlidingWindowRateLimitStore } from './redis-rate-limit.store';
import type { RateLimitGuardOptions, RateLimitMetricsSink, RateLimitPolicyResolver, RateLimitStore } from './types';

export interface StynxRateLimitModuleOptions extends RateLimitGuardOptions {
  store?: RateLimitStore;
  policyResolver?: RateLimitPolicyResolver;
  metrics?: RateLimitMetricsSink;
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
          reflector: Reflector,
          providedOptions: StynxRateLimitModuleOptions,
          store?: RateLimitStore,
          policyResolver?: RateLimitPolicyResolver,
          metrics?: RateLimitMetricsSink,
        ) => new RateLimitGuard(reflector, providedOptions, store, policyResolver, metrics),
        inject: [Reflector, STYNX_RATE_LIMIT_OPTIONS, STYNX_RATE_LIMIT_STORE, STYNX_RATE_LIMIT_POLICY, STYNX_RATE_LIMIT_METRICS],
      },
      RedisSlidingWindowRateLimitStore,
      DatabaseRateLimitPolicyResolver,
    ];

    if (options.store) {
      providers.push({
        provide: STYNX_RATE_LIMIT_STORE,
        useValue: options.store,
      });
    } else {
      providers.push({
        provide: STYNX_RATE_LIMIT_STORE,
        useExisting: RedisSlidingWindowRateLimitStore,
      });
    }

    providers.push(
      options.policyResolver
        ? { provide: STYNX_RATE_LIMIT_POLICY, useValue: options.policyResolver }
        : { provide: STYNX_RATE_LIMIT_POLICY, useExisting: DatabaseRateLimitPolicyResolver },
    );

    providers.push(
      options.metrics
        ? { provide: STYNX_RATE_LIMIT_METRICS, useValue: options.metrics }
        : { provide: STYNX_RATE_LIMIT_METRICS, useClass: InMemoryRateLimitMetrics },
    );

    return {
      module: StynxRateLimitModule,
      providers,
      exports: providers,
    };
  }
}
