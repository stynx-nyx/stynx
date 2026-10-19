import { type DynamicModule, Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { resolveAppRoleName } from './app-role.js';
import { Database } from './database.js';
import { StynxMigrationRunner } from './migration-runner.js';
import { StynxPoolRegistry } from './pools.js';
import {
  STYNX_DATABASE,
  STYNX_DATA_METRICS,
  STYNX_DATA_OPTIONS,
  type StynxDataModuleOptions,
} from './tokens.js';

export type { StynxDataModuleOptions } from './tokens.js';

@Module({})
export class StynxDataModule {
  static forRoot(options: StynxDataModuleOptions): DynamicModule {
    resolveAppRoleName(options);
    return {
      module: StynxDataModule,
      global: true,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'data',
          schema: z.object({}),
        }),
      ],
      providers: [
        {
          provide: STYNX_DATA_OPTIONS,
          useValue: options,
        },
        {
          provide: STYNX_DATA_METRICS,
          useValue: options.metrics ?? null,
        },
        StynxPoolRegistry,
        StynxMigrationRunner,
        Database,
        { provide: STYNX_DATABASE, useExisting: Database },
      ],
      exports: [
        STYNX_DATABASE,
        STYNX_DATA_OPTIONS,
        STYNX_DATA_METRICS,
        StynxPoolRegistry,
        StynxMigrationRunner,
        Database,
      ],
    };
  }
}
