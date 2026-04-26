import { DynamicModule, Module, Provider } from '@nestjs/common';
import type { DocumentMetadataRepository, ObjectStorageService } from '@stech/stynx-contracts';
import { STYNX_DOCUMENT_METADATA_REPOSITORY, STYNX_OBJECT_STORAGE } from './constants';

export interface StynxStorageModuleOptions {
  objectStorage: ObjectStorageService;
  metadataRepository?: DocumentMetadataRepository;
}

@Module({})
export class StynxStorageModule {
  static forRoot(options: StynxStorageModuleOptions): DynamicModule {
    const providers: Provider[] = [
      { provide: STYNX_OBJECT_STORAGE, useValue: options.objectStorage },
    ];

    if (options.metadataRepository) {
      providers.push({
        provide: STYNX_DOCUMENT_METADATA_REPOSITORY,
        useValue: options.metadataRepository,
      });
    }

    return {
      module: StynxStorageModule,
      providers,
      exports: providers,
    };
  }
}
