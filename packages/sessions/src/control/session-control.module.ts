import { type DynamicModule, Module } from '@nestjs/common';
import { InMemorySessionRegistry } from './in-memory-registry';
import { PostgresSessionRegistry } from './postgres-registry';
import { SessionControlController } from './session-control.controller';
import { SessionControlService } from './session-control.service';
import {
  STYNX_SESSION_CONTROL_AUDIT,
  STYNX_SESSION_CONTROL_OPTIONS,
  STYNX_SESSION_PROVIDER,
  STYNX_SESSION_REGISTRY,
} from './tokens';
import type {
  SessionAuditSink,
  SessionProviderAdapter,
  SessionRegistry,
  StynxSessionControlOptions,
} from './types';
const noop: SessionAuditSink = { write: () => undefined };
@Module({})
export class StynxSessionControlModule {
  static forRoot(options: StynxSessionControlOptions): DynamicModule {
    return {
      module: StynxSessionControlModule,
      controllers: [SessionControlController],
      providers: [
        { provide: STYNX_SESSION_CONTROL_OPTIONS, useValue: options },
        ...(options.registry === 'postgres'
          ? [
              PostgresSessionRegistry,
              { provide: STYNX_SESSION_REGISTRY, useExisting: PostgresSessionRegistry },
            ]
          : [
              {
                provide: STYNX_SESSION_REGISTRY,
                useValue: options.registry ?? new InMemorySessionRegistry(),
              },
            ]),
        { provide: STYNX_SESSION_PROVIDER, useValue: options.provider },
        { provide: STYNX_SESSION_CONTROL_AUDIT, useValue: options.audit ?? noop },
        {
          provide: SessionControlService,
          inject: [STYNX_SESSION_REGISTRY, STYNX_SESSION_PROVIDER, STYNX_SESSION_CONTROL_AUDIT],
          useFactory: (
            registry: SessionRegistry,
            provider: SessionProviderAdapter,
            audit: SessionAuditSink,
          ) => new SessionControlService(registry, provider, audit, options.now),
        },
      ],
      exports: [SessionControlService, STYNX_SESSION_REGISTRY],
    };
  }
}
