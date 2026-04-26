import { APP_INTERCEPTOR } from '@nestjs/core';
import { StynxAuthModule } from '../../src/auth.module';
import { ActorContextInterceptor } from '../../src/actor-context.interceptor';
import { CognitoJwtValidator } from '../../src/cognito-jwt.validator';
import { EffectiveHashComputer } from '../../src/effective-hash-computer';
import { PermissionCache } from '../../src/permission-cache';
import { PermissionCacheMetrics } from '../../src/permission-cache-metrics';
import { PermissionGuard } from '../../src/permission.guard';
import { PermissionQueryService } from '../../src/permission-query.service';
import { RedisPermissionCacheBackend } from '../../src/redis-permission-cache-backend';
import { StynxAuthController } from '../../src/auth.controller';
import { StynxAuthService } from '../../src/auth.service';
import { StynxAuthGuard } from '../../src/stynx-auth.guard';
import { StynxJwtValidator } from '../../src/stynx-jwt.validator';
import { STYNX_AUTH_OPTIONS, STYNX_PERMISSION_CACHE_BACKEND } from '../../src/tokens';

describe('StynxAuthModule', () => {
  it('builds the dynamic module with the expected controller, providers, and exports', () => {
    const dynamicModule = StynxAuthModule.forRoot({
      stynx: { issuer: 'https://issuer.test' },
      redis: { url: 'redis://127.0.0.1:6379' },
    });

    expect(dynamicModule.global).toBe(true);
    expect(dynamicModule.imports).toHaveLength(1);
    expect(dynamicModule.controllers).toContain(StynxAuthController);
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
    ) as { useFactory: (backend: RedisPermissionCacheBackend) => RedisPermissionCacheBackend | null };

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
    ) as { useFactory: (backend: RedisPermissionCacheBackend) => RedisPermissionCacheBackend | null };

    expect(backendProvider.useFactory({} as RedisPermissionCacheBackend)).toBeNull();
  });
});
