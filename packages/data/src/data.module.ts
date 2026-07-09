import { type DynamicModule, Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { Database } from './database';
import { StynxMigrationRunner } from './migration-runner';
import { StynxPoolRegistry } from './pools';
import { STYNX_DATA_METRICS, STYNX_DATA_OPTIONS, type StynxDataModuleOptions } from './tokens';

export type { StynxDataModuleOptions } from './tokens';

@Module({})
export class StynxDataModule {
  static forRoot(options: StynxDataModuleOptions): DynamicModule {
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
      ],
      exports: [STYNX_DATA_OPTIONS, STYNX_DATA_METRICS, StynxPoolRegistry, StynxMigrationRunner, Database],
    };
  }
}
