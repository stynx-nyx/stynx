import { type DynamicModule, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { StynxHealthController } from './health.controller.js';
import { StynxHealthService } from './health.service.js';
import { StynxPlatformInfoGuard } from './info.guard.js';
import { StynxMetricsService } from './metrics.service.js';
import {
  STYNX_HEALTH_INDICATORS,
  STYNX_HEALTH_OPTIONS,
  type StynxHealthIndicator,
  type StynxHealthModuleOptions,
} from './tokens.js';

@Module({})
export class StynxHealthModule {
  static forRoot(
    options: StynxHealthModuleOptions = {},
    indicators: StynxHealthIndicator[] = [],
  ): DynamicModule {
    return {
      module: StynxHealthModule,
      imports: [TerminusModule],
      controllers: [StynxHealthController],
      providers: [
        {
          provide: STYNX_HEALTH_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_HEALTH_INDICATORS,
          useValue: indicators,
        },
        StynxPlatformInfoGuard,
        StynxMetricsService,
        StynxHealthService,
      ],
      exports: [StynxMetricsService, StynxHealthService, StynxPlatformInfoGuard],
    };
  }
}
