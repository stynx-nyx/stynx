import {
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { PrivacyController } from './privacy.controller';
import { PrivacyObjectStoreService } from './privacy-object-store.service';
import { PiiMapService } from './pii-map.service';
import { PrivacyService } from './privacy.service';
import { PrivacyHttpContextMiddleware } from './privacy-context';
import { PrivacyRetentionPermissionGuard } from './privacy-retention.guard';
import { UnconfiguredPrivacyCognitoAdmin } from './unconfigured-identity';
import {
  STYNX_PRIVACY_COGNITO_ADMIN,
  STYNX_PRIVACY_OBJECT_STORE,
  STYNX_PRIVACY_OPTIONS,
} from './tokens';
import type { PrivacyCognitoAdmin, PrivacyObjectStore, StynxPrivacyModuleOptions } from './types';

@Module({})
export class StynxPrivacyModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(PrivacyHttpContextMiddleware)
      .forRoutes({ path: '{*path}', method: RequestMethod.ALL });
  }
  static forRoot(
    options: StynxPrivacyModuleOptions & {
      objectStore?: PrivacyObjectStore;
      cognitoAdmin?: PrivacyCognitoAdmin;
    },
  ): DynamicModule {
    const objectStoreProvider = options.objectStore
      ? { provide: STYNX_PRIVACY_OBJECT_STORE, useValue: options.objectStore }
      : { provide: STYNX_PRIVACY_OBJECT_STORE, useClass: PrivacyObjectStoreService };

    return {
      module: StynxPrivacyModule,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'privacy',
          schema: z.object({}) as never,
        }),
      ],
      controllers: [PrivacyController],
      providers: [
        {
          provide: STYNX_PRIVACY_OPTIONS,
          useValue: options,
        },
        objectStoreProvider,
        {
          provide: STYNX_PRIVACY_COGNITO_ADMIN,
          useValue: options.cognitoAdmin ?? new UnconfiguredPrivacyCognitoAdmin(),
        },
        PiiMapService,
        PrivacyService,
        PrivacyHttpContextMiddleware,
        PrivacyRetentionPermissionGuard,
      ],
      exports: [
        STYNX_PRIVACY_OPTIONS,
        STYNX_PRIVACY_OBJECT_STORE,
        STYNX_PRIVACY_COGNITO_ADMIN,
        PiiMapService,
        PrivacyService,
      ],
    };
  }
}
