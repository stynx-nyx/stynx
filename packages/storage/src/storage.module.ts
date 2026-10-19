import { type DynamicModule, Module } from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { DocumentsService } from './documents.service.js';
import { S3Service } from './s3.service.js';
import { STYNX_STORAGE_OPTIONS } from './tokens.js';
import type { StynxStorageModuleOptions } from './types.js';

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
