import { DynamicModule, Module, Provider } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import {
  IdempotencyInterceptor,
  StynxIdempotencyModule,
  type StynxIdempotencyModuleOptions,
} from '@stynx-nyx/idempotency';
import {
  RateLimitGuard,
  StynxRateLimitModule,
  type StynxRateLimitModuleOptions,
} from '@stynx-nyx/ratelimit';
import { SlaMonitorInterceptor } from '../sla/sla-monitor.interceptor';
import {
  StynxSlaModule,
  type StynxSlaModuleOptions,
} from '../sla/sla.module';

export interface StynxPlatformPipelineModuleOptions {
  rateLimit?: StynxRateLimitModuleOptions | false;
  sla?: StynxSlaModuleOptions | false;
  idempotency?: StynxIdempotencyModuleOptions | false;
}

@Module({})
export class StynxPlatformPipelineModule {
  static forRoot(options: StynxPlatformPipelineModuleOptions = {}): DynamicModule {
    const imports: DynamicModule[] = [];
    const providers: Provider[] = [];

    if (options.rateLimit !== false) {
      imports.push(StynxRateLimitModule.forRoot(options.rateLimit ?? {}));
      providers.push({
        provide: APP_GUARD,
        useExisting: RateLimitGuard,
      });
    }

    if (options.sla !== false) {
      imports.push(StynxSlaModule.forRoot(options.sla ?? {}));
      providers.push({
        provide: APP_INTERCEPTOR,
        useExisting: SlaMonitorInterceptor,
      });
    }

    if (options.idempotency !== false) {
      imports.push(StynxIdempotencyModule.forRoot(options.idempotency ?? {}));
      providers.push({
        provide: APP_INTERCEPTOR,
        useExisting: IdempotencyInterceptor,
      });
    }

    return {
      module: StynxPlatformPipelineModule,
      imports,
      providers,
      exports: imports,
    };
  }
}
