import { type DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StynxCoreModule } from '@stynx-nyx/core';
import { STYNX_SESSION_CLAIMS_RESOLVER } from '@stynx-nyx/sessions';
import { z } from 'zod';
import { ActorContextInterceptor } from './actor-context.interceptor.js';
import { StynxAuthController } from './auth.controller.js';
import { StynxAuthService } from './auth.service.js';
import { CognitoJwtValidator } from './cognito-jwt.validator.js';
import { EffectiveHashComputer } from './effective-hash-computer.js';
import { PermissionCache } from './permission-cache.js';
import { PermissionCacheMetrics } from './permission-cache-metrics.js';
import { PermissionGuard } from './permission.guard.js';
import { PermissionQueryService } from './permission-query.service.js';
import { RedisPermissionCacheBackend } from './redis-permission-cache-backend.js';
import { StynxAuthGuard } from './stynx-auth.guard.js';
import { PublicTenantBootstrap } from './public-tenant-bootstrap.js';
import { StynxSessionClaimsResolver } from './session-claims-resolver.js';
import { StynxJwtValidator } from './stynx-jwt.validator.js';
import { STYNX_AUTH_OPTIONS, STYNX_PERMISSION_CACHE_BACKEND } from './tokens.js';
import { resolveAuthOptions, type StynxAuthModuleOptions } from './types.js';

@Module({
  imports: [
    StynxCoreModule.forRoot({
      appName: 'auth',
      schema: z.object({}),
    }),
  ],
  controllers: [StynxAuthController],
})
export class StynxAuthModule {
  static forRoot(options: StynxAuthModuleOptions): DynamicModule {
    const resolved = resolveAuthOptions(options);
    return {
      module: StynxAuthModule,
      global: true,
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
        StynxSessionClaimsResolver,
        {
          provide: STYNX_SESSION_CLAIMS_RESOLVER,
          useExisting: StynxSessionClaimsResolver,
        },
        StynxAuthGuard,
        PublicTenantBootstrap,
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
        StynxSessionClaimsResolver,
        STYNX_SESSION_CLAIMS_RESOLVER,
        StynxAuthGuard,
        PermissionGuard,
      ],
    };
  }
}
