import {
  type DynamicModule,
  MiddlewareConsumer,
  Module,
  type NestModule,
} from '@nestjs/common';
import { StynxCoreModule } from '@stynx/core';
import { z } from 'zod';
import { LoggingDedupeService } from './dedupe';
import { StynxLogger } from './logger.service';
import { createPinoLogger, RequestLogFieldFactory } from './pino.factory';
import { RequestLoggingMiddleware } from './request-logging.middleware';
import { STYNX_LOGGING_OPTIONS, STYNX_PINO_LOGGER, type StynxLoggingOptions } from './tokens';

@Module({})
export class StynxLoggingModule implements NestModule {
  static forRoot(options: StynxLoggingOptions = {}): DynamicModule {
    return {
      module: StynxLoggingModule,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'logging',
          schema: z.object({}),
        }),
      ],
      providers: [
        {
          provide: STYNX_LOGGING_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_PINO_LOGGER,
          inject: [STYNX_LOGGING_OPTIONS],
          useFactory: createPinoLogger,
        },
        {
          provide: LoggingDedupeService,
          inject: [STYNX_LOGGING_OPTIONS],
          useFactory: (resolvedOptions: StynxLoggingOptions) =>
            new LoggingDedupeService(resolvedOptions),
        },
        RequestLogFieldFactory,
        StynxLogger,
        RequestLoggingMiddleware,
      ],
      exports: [
        STYNX_PINO_LOGGER,
        RequestLogFieldFactory,
        StynxLogger,
      ],
    };
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}
