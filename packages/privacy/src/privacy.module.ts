import {
  type DynamicModule,
  type MiddlewareConsumer,
  type NestModule,
  Module,
  RequestMethod,
} from '@nestjs/common';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { PrivacyController } from './privacy.controller.js';
import { PrivacyObjectStoreService } from './privacy-object-store.service.js';
import { PiiMapService } from './pii-map.service.js';
import { PrivacyService } from './privacy.service.js';
import { PrivacyHttpContextMiddleware } from './privacy-context.js';
import { PrivacyRetentionPermissionGuard } from './privacy-retention.guard.js';
import { UnconfiguredPrivacyCognitoAdmin } from './unconfigured-identity.js';
import {
  STYNX_PRIVACY_COGNITO_ADMIN,
  STYNX_PRIVACY_OBJECT_STORE,
  STYNX_PRIVACY_OPTIONS,
} from './tokens.js';
import type { PrivacyCognitoAdmin, PrivacyObjectStore, StynxPrivacyModuleOptions } from './types.js';

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
          schema: z.object({}),
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
