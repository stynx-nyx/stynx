import { type DynamicModule, Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx/core';
import { z } from 'zod';
import { SessionJwksController } from './jwks.controller';
import { SessionJwtSigningService } from './jwt-signing.service';
import { RedisSessionStore } from './redis-session-store';
import { SessionMirrorWriter } from './session-mirror.writer';
import { SessionService } from './session.service';
import { STYNX_SESSION_MIRROR, STYNX_SESSIONS_OPTIONS, STYNX_SESSION_STORE } from './tokens';
import { resolveSessionsOptions, type StynxSessionsModuleOptions } from './types';

@Module({})
export class StynxSessionsModule {
  static forRoot(options: StynxSessionsModuleOptions): DynamicModule {
    return {
      module: StynxSessionsModule,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'sessions',
          schema: z.object({}),
        }),
      ],
      controllers: [SessionJwksController],
      providers: [
        {
          provide: STYNX_SESSIONS_OPTIONS,
          useValue: resolveSessionsOptions(options),
        },
        RedisSessionStore,
        {
          provide: STYNX_SESSION_STORE,
          useExisting: RedisSessionStore,
        },
        {
          provide: STYNX_SESSION_MIRROR,
          useClass: SessionMirrorWriter,
        },
        SessionJwtSigningService,
        SessionService,
      ],
      exports: [STYNX_SESSIONS_OPTIONS, STYNX_SESSION_STORE, STYNX_SESSION_MIRROR, SessionJwtSigningService, SessionService],
    };
  }
}
