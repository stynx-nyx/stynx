import { type DynamicModule, Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx/core';
import { z } from 'zod';
import { DocumentsService } from './documents.service';
import { S3Service } from './s3.service';
import { STYNX_STORAGE_OPTIONS } from './tokens';
import type { StynxStorageModuleOptions } from './types';

@Module({})
export class StynxStorageModule {
  static forRoot(options: StynxStorageModuleOptions): DynamicModule {
    return {
      module: StynxStorageModule,
      global: true,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'storage',
          schema: z.object({}) as never,
        }),
      ],
      providers: [
        {
          provide: STYNX_STORAGE_OPTIONS,
          useValue: options,
        },
        S3Service,
        DocumentsService,
      ],
      exports: [STYNX_STORAGE_OPTIONS, S3Service, DocumentsService],
    };
  }
}
