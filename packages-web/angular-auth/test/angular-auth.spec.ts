import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { TenantContextService } from '@stynx-web/angular';
import { stynxAuthGuard } from '../src/auth.guard';
import { StynxHasPermissionDirective } from '../src/has-permission.directive';
import { stynxPermissionGuard } from '../src/permission.guard';
import { StynxSessionService } from '../src/session.service';
import { STYNX_ANGULAR_AUTH_OPTIONS } from '../src/tokens';
import type { StynxAuthBackend, StynxOidcAdapter, StynxSessionBundle } from '../src/types';

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

class FakeTemplateRef {}

class FakeViewContainerRef {
  rendered = 0;
  cleared = 0;

  createEmbeddedView(): void {
    this.rendered += 1;
  }

  clear(): void {
    this.cleared += 1;
  }
}

describe('@stynx-web/angular-auth', () => {
  it('auth guard redirects to the login route when no session is active', () => {
    const injector = Injector.create({
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            snapshot: () => ({ active: false }),
          },
        },
        {
          provide: Router,
          useValue: {
            parseUrl: (value: string) => `URL:${value}`,
          },
        },
        {
          provide: STYNX_ANGULAR_AUTH_OPTIONS,
          useValue: {
            oidc: {
              authority: 'https://issuer.example.test',
              clientId: 'client-id',
              redirectUrl: 'https://app.example.test/login/callback',
              postLogoutRedirectUri: 'https://app.example.test',
              scope: 'openid profile email offline_access',
              responseType: 'code',
              silentRenew: true,
              useRefreshToken: true,
            },
            loginRedirectRoute: '/login',
          },
        },
      ],
    });

    const result = runInInjectionContext(injector, () => stynxAuthGuard({} as never, {} as never));
    expect(result).toBe('URL:/login');
  });

  it('switches tenant and updates both session state and tenant context', async () => {
    const oidc: StynxOidcAdapter = {
      checkAuth: async () => ({
        isAuthenticated: true,
        accessToken: createJwt({ sub: 'oidc-sub' }),
        idToken: '',
        userData: {},
        configId: 'default',
      }),
      authorize: () => undefined,
      logoff: async () => undefined,
      forceRefreshSession: async () => ({
        isAuthenticated: true,
        accessToken: createJwt({ sub: 'oidc-sub' }),
        idToken: '',
        userData: {},
        configId: 'default',
      }),
    };

    const bundleFor = (tenantId: string): StynxSessionBundle => ({
      sid: `sid-${tenantId}`,
      accessToken: createJwt({ sub: 'user-1', tenant_id: tenantId, permissions: ['document:write:*'] }),
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: `refresh-${tenantId}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    const backend: StynxAuthBackend = {
      exchangeCognitoToken: async (_cognitoToken, tenantId) => bundleFor(tenantId),
      switchTenant: async (_accessToken, tenantId) => bundleFor(tenantId),
      logout: async () => undefined,
    };

    const tenantContext = new TenantContextService(
      {},
      {
        location: {
          href: 'https://app.example.test/dashboard?tenantId=tenant-a',
          host: 'app.example.test',
        },
      } as never,
    );

    const service = new StynxSessionService(
      tenantContext,
      oidc,
      backend,
      {
        oidc: {
          authority: 'https://issuer.example.test',
          clientId: 'client-id',
          redirectUrl: 'https://app.example.test/login/callback',
          postLogoutRedirectUri: 'https://app.example.test',
          scope: 'openid profile email offline_access',
          responseType: 'code',
          silentRenew: true,
          useRefreshToken: true,
        },
      },
    );

    await service.completeLogin('https://app.example.test/login/callback?code=abc');
    expect(service.snapshot().tenantId).toBe('tenant-a');

    await service.switchTenant('tenant-b');
    expect(service.snapshot().tenantId).toBe('tenant-b');
    expect(service.snapshot().sid).toBe('sid-tenant-b');
    expect(tenantContext.tenantId()).toBe('tenant-b');
  });

  it('permission guard denies and allows based on session permissions', async () => {
    const tenantContext = new TenantContextService(
      {},
      null,
    );
    tenantContext.setTenant('tenant-a', 'manual');

    const service = new StynxSessionService(
      tenantContext,
      {
        checkAuth: async () => ({
          isAuthenticated: true,
          accessToken: createJwt({ sub: 'oidc-sub' }),
          idToken: '',
          userData: {},
          configId: 'default',
        }),
        authorize: () => undefined,
        logoff: async () => undefined,
        forceRefreshSession: async () => ({
          isAuthenticated: true,
          accessToken: createJwt({ sub: 'oidc-sub' }),
          idToken: '',
          userData: {},
          configId: 'default',
        }),
      },
      {
        exchangeCognitoToken: async () => ({
          sid: 'sid-1',
          accessToken: createJwt({ sub: 'user-1', tenant_id: 'tenant-a', permissions: ['document:write:*'] }),
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          refreshToken: 'refresh-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        switchTenant: async () => {
          throw new Error('not used');
        },
        logout: async () => undefined,
      },
      {
        oidc: {
          authority: 'https://issuer.example.test',
          clientId: 'client-id',
          redirectUrl: 'https://app.example.test/login/callback',
          postLogoutRedirectUri: 'https://app.example.test',
          scope: 'openid profile email offline_access',
          responseType: 'code',
          silentRenew: true,
          useRefreshToken: true,
        },
      },
    );
    await service.completeLogin();

    const router = {
      parseUrl: (value: string) => `URL:${value}`,
    };

    const injector = Injector.create({
      providers: [
        { provide: StynxSessionService, useValue: service },
        { provide: Router, useValue: router },
        {
          provide: STYNX_ANGULAR_AUTH_OPTIONS,
          useValue: {
            oidc: {
              authority: 'https://issuer.example.test',
              clientId: 'client-id',
              redirectUrl: 'https://app.example.test/login/callback',
              postLogoutRedirectUri: 'https://app.example.test',
              scope: 'openid profile email offline_access',
              responseType: 'code',
              silentRenew: true,
              useRefreshToken: true,
            },
            unauthorizedRoute: '/forbidden',
          },
        },
      ],
    });

    const allow = runInInjectionContext(
      injector,
      () => stynxPermissionGuard('document:write:*')({} as never, {} as never),
    );
    const deny = runInInjectionContext(
      injector,
      () => stynxPermissionGuard('document:delete:*')({} as never, {} as never),
    );
    expect(allow).toBe(true);
    expect(deny).toBe('URL:/forbidden');
  });

  it('has-permission directive renders only when the session grants the permission', () => {
    const tenantContext = new TenantContextService(
      {},
      null,
    );
    tenantContext.setTenant('tenant-a', 'manual');

    const service = new StynxSessionService(
      tenantContext,
      {
        checkAuth: async () => ({
          isAuthenticated: true,
          accessToken: createJwt({ sub: 'oidc-sub' }),
          idToken: '',
          userData: {},
          configId: 'default',
        }),
        authorize: () => undefined,
        logoff: async () => undefined,
        forceRefreshSession: async () => ({
          isAuthenticated: true,
          accessToken: createJwt({ sub: 'oidc-sub' }),
          idToken: '',
          userData: {},
          configId: 'default',
        }),
      },
      {
        exchangeCognitoToken: async () => ({
          sid: 'sid-1',
          accessToken: createJwt({ sub: 'user-1', tenant_id: 'tenant-a', permissions: ['document:write:*'] }),
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          refreshToken: 'refresh-1',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        switchTenant: async () => {
          throw new Error('not used');
        },
        logout: async () => undefined,
      },
      {
        oidc: {
          authority: 'https://issuer.example.test',
          clientId: 'client-id',
          redirectUrl: 'https://app.example.test/login/callback',
          postLogoutRedirectUri: 'https://app.example.test',
          scope: 'openid profile email offline_access',
          responseType: 'code',
          silentRenew: true,
          useRefreshToken: true,
        },
      },
    );

    return service.completeLogin().then(() => {
      const view = new FakeViewContainerRef();
      const directive = new StynxHasPermissionDirective(
        new FakeTemplateRef() as never,
        view as never,
        service,
      );
      directive.stynxHasPermission = 'document:write:*';
      expect(view.rendered).toBe(1);

      directive.stynxHasPermission = 'document:delete:*';
      expect(view.cleared).toBe(1);
    });
  });
});
