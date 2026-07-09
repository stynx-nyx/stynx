import { type DynamicModule, Module, OnModuleDestroy, OnModuleInit, Inject, Optional, Injectable } from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { StynxAuditController } from './audit.controller';
import { StynxAuditService } from './audit.service';
import {
  STYNX_AUDIT_ARCHIVE_STORE,
  STYNX_AUDIT_CLOCK,
  STYNX_AUDIT_DUMP_RUNNER,
  STYNX_AUDIT_OPTIONS,
  type AuditArchiveStore,
  type AuditClock,
  type AuditDumpRunner,
} from './tokens';
import type { StynxAuditModuleOptions } from './types';

class SystemAuditClock implements AuditClock {
  now(): Date {
    return new Date();
  }
}

@Injectable()
class AuditDailyDetachScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly auditService: StynxAuditService,
    @Inject(STYNX_AUDIT_OPTIONS)
    private readonly options: StynxAuditModuleOptions,
    @Optional()
    @Inject(STYNX_AUDIT_DUMP_RUNNER)
    private readonly dumpRunner?: AuditDumpRunner | null,
    @Optional()
    @Inject(STYNX_AUDIT_ARCHIVE_STORE)
    private readonly archiveStore?: AuditArchiveStore | null,
  ) {}

  onModuleInit(): void {
    if (!this.options.dailyDetachEnabled || !this.dumpRunner || !this.archiveStore || !this.options.bucket) {
      return;
    }
    this.timer = setInterval(() => {
      void this.auditService.runDailyDetachJob();
    }, this.options.dailyDetachIntervalMs ?? 24 * 60 * 60 * 1000);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }
}

@Module({})
export class StynxAuditModule {
  static forRoot(options: StynxAuditModuleOptions = {}): DynamicModule {
    return {
      module: StynxAuditModule,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'audit',
          schema: z.object({}) as never,
        }),
      ],
      controllers: [StynxAuditController],
      providers: [
        {
          provide: STYNX_AUDIT_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_AUDIT_CLOCK,
          useClass: SystemAuditClock,
        },
        {
          provide: STYNX_AUDIT_DUMP_RUNNER,
          useValue: null,
        },
        {
          provide: STYNX_AUDIT_ARCHIVE_STORE,
          useValue: null,
        },
        StynxAuditService,
        AuditDailyDetachScheduler,
      ],
      exports: [
        STYNX_AUDIT_OPTIONS,
        STYNX_AUDIT_CLOCK,
        STYNX_AUDIT_DUMP_RUNNER,
        STYNX_AUDIT_ARCHIVE_STORE,
        StynxAuditService,
      ],
    };
  }
}
