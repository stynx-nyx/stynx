import { MODULE_METADATA } from '@nestjs/common/constants.js';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StynxAuthModule } from '../../src/auth.module.js';
import { ActorContextInterceptor } from '../../src/actor-context.interceptor.js';
import { CognitoJwtValidator } from '../../src/cognito-jwt.validator.js';
import { EffectiveHashComputer } from '../../src/effective-hash-computer.js';
import { PermissionCache } from '../../src/permission-cache.js';
import { PermissionCacheMetrics } from '../../src/permission-cache-metrics.js';
import { PermissionGuard } from '../../src/permission.guard.js';
import { PermissionQueryService } from '../../src/permission-query.service.js';
import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend.js';
import { StynxAuthController } from '../../src/auth.controller.js';
import { StynxAuthService } from '../../src/auth.service.js';
import { StynxAuthGuard } from '../../src/stynx-auth.guard.js';
import { StynxJwtValidator } from '../../src/stynx-jwt.validator.js';
import { STYNX_AUTH_OPTIONS, STYNX_PERMISSION_CACHE_BACKEND } from '../../src/tokens.js';
import { resolveAuthOptions } from '../../src/types.js';

describe('StynxAuthModule', () => {
  it('builds the dynamic module with the expected controller, providers, and exports', () => {
    const dynamicModule = StynxAuthModule.forRoot({
      stynx: { issuer: 'https://issuer.test' },
      redis: { url: 'redis://127.0.0.1:6379' },
    });

    expect(dynamicModule.global).toBe(true);
    // SM-20: imports and controllers are static @Module metadata, not forRoot() output.
    expect(dynamicModule.imports).toBe(undefined);
    expect(dynamicModule.controllers).toBe(undefined);
    expect(Reflect.getMetadata(MODULE_METADATA.IMPORTS, StynxAuthModule)).toHaveLength(1);
    expect(Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, StynxAuthModule)).toEqual([
      StynxAuthController,
    ]);
    expect(dynamicModule.exports).toEqual(
      expect.arrayContaining([
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
      ]),
    );

    expect(dynamicModule.providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: STYNX_AUTH_OPTIONS,
          useValue: expect.objectContaining({
            stynx: { issuer: 'https://issuer.test' },
            redis: expect.objectContaining({ url: 'redis://127.0.0.1:6379' }),
          }),
        }),
        expect.objectContaining({
          provide: APP_INTERCEPTOR,
          useClass: ActorContextInterceptor,
        }),
        RedisPermissionCacheBackend,
        CognitoJwtValidator,
        StynxJwtValidator,
        PermissionCacheMetrics,
        PermissionQueryService,
        PermissionCache,
        EffectiveHashComputer,
        StynxAuthService,
        StynxAuthGuard,
        PermissionGuard,
      ]),
    );

    const backendProvider = (dynamicModule.providers ?? []).find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === STYNX_PERMISSION_CACHE_BACKEND,
    ) as {
      useFactory: (backend: RedisPermissionCacheBackend) => RedisPermissionCacheBackend | null;
    };

    const backend = {} as RedisPermissionCacheBackend;
    expect(backendProvider.useFactory(backend)).toBe(backend);
    expect(backendProvider).toMatchObject({
      inject: [RedisPermissionCacheBackend],
    });
  });

  it('returns a null cache backend when redis support is disabled', () => {
    const dynamicModule = StynxAuthModule.forRoot({
      stynx: { issuer: 'https://issuer.test' },
    });

    const backendProvider = (dynamicModule.providers ?? []).find(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === STYNX_PERMISSION_CACHE_BACKEND,
    ) as {
      useFactory: (backend: RedisPermissionCacheBackend) => RedisPermissionCacheBackend | null;
    };

    expect(backendProvider.useFactory({} as RedisPermissionCacheBackend)).toBe(null);
  });

  it('resolves auth options with defaults and optional redis/permission overrides', () => {
    expect(resolveAuthOptions({})).toEqual({
      stynx: { issuer: 'https://stynx.local' },
      permissions: { dbFallbackOnRedisDown: true },
    });

    expect(
      resolveAuthOptions({
        cognito: { issuer: 'https://cognito.test', audience: 'web' },
        stynx: {
          issuer: 'https://stynx.test',
          audience: 'api',
          jwksUri: 'https://stynx.test/jwks',
        },
        redis: { url: 'redis://local' },
        permissions: {
          dbFallbackOnRedisDown: false,
          driftResyncIntervalMs: 250,
        },
      }),
    ).toEqual({
      cognito: { issuer: 'https://cognito.test', audience: 'web' },
      stynx: {
        issuer: 'https://stynx.test',
        audience: 'api',
        jwksUri: 'https://stynx.test/jwks',
      },
      redis: {
        url: 'redis://local',
        keyPrefix: 'stynx:auth',
        invalidateChannel: 'perms:invalidate',
      },
      permissions: {
        dbFallbackOnRedisDown: false,
        driftResyncIntervalMs: 250,
      },
    });
  });
});
