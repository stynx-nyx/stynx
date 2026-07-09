import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StynxCoreModule } from '@stynx-nyx/core';
import { z } from 'zod';
import { ActorContextInterceptor } from './actor-context.interceptor';
import { StynxAuthController } from './auth.controller';
import { StynxAuthService } from './auth.service';
import { CognitoJwtValidator } from './cognito-jwt.validator';
import { EffectiveHashComputer } from './effective-hash-computer';
import { PermissionCache } from './permission-cache';
import { PermissionCacheMetrics } from './permission-cache-metrics';
import { PermissionGuard } from './permission.guard';
import { PermissionQueryService } from './permission-query.service';
import { RedisPermissionCacheBackend } from './redis-permission-cache-backend';
import { StynxAuthGuard } from './stynx-auth.guard';
import { StynxJwtValidator } from './stynx-jwt.validator';
import { STYNX_AUTH_OPTIONS, STYNX_PERMISSION_CACHE_BACKEND } from './tokens';
import { resolveAuthOptions, type StynxAuthModuleOptions } from './types';

@Module({})
export class StynxAuthModule {
  static forRoot(options: StynxAuthModuleOptions): DynamicModule {
    const resolved = resolveAuthOptions(options);
    return {
      module: StynxAuthModule,
      global: true,
      imports: [
        StynxCoreModule.forRoot({
          appName: 'auth',
          schema: z.object({}),
        }),
      ],
      controllers: [StynxAuthController],
      providers: [
        {
          provide: STYNX_AUTH_OPTIONS,
          useValue: resolved,
        },
        {
          provide: APP_INTERCEPTOR,
          useClass: ActorContextInterceptor,
        },
        ActorContextInterceptor,
        RedisPermissionCacheBackend,
        {
          provide: STYNX_PERMISSION_CACHE_BACKEND,
          useFactory: (backend: RedisPermissionCacheBackend) => (resolved.redis ? backend : null),
          inject: [RedisPermissionCacheBackend],
        },
        CognitoJwtValidator,
        StynxJwtValidator,
        PermissionCacheMetrics,
        PermissionQueryService,
        PermissionCache,
        EffectiveHashComputer,
        StynxAuthService,
        StynxAuthGuard,
        PermissionGuard,
      ],
      exports: [
        STYNX_AUTH_OPTIONS,
        STYNX_PERMISSION_CACHE_BACKEND,
        CognitoJwtValidator,
        StynxJwtValidator,
        PermissionCacheMetrics,
        PermissionQueryService,
        PermissionCache,
        EffectiveHashComputer,
        StynxAuthService,
        StynxAuthGuard,
        PermissionGuard,
      ],
    };
  }
}
