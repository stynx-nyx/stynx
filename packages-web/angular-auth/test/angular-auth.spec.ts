import '@angular/compiler';
import { HttpHeaders } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { Router } from '@angular/router';
import { TenantContextService } from '@stynx-web/angular';
import { of } from 'rxjs';
import { parseJwtPayload, normalizePermissions } from '../src/jwt';
import { RefreshTokenStorage } from '../src/storage';
import { stynxAuthGuard } from '../src/auth.guard';
import { HttpAuthBackend } from '../src/http-auth.backend';
import { StynxHasPermissionDirective } from '../src/has-permission.directive';
import { StynxLoginRedirectComponent } from '../src/login-redirect.component';
import { StynxLogoutButtonComponent } from '../src/logout-button.component';
import { OidcClientAdapter } from '../src/oidc-client.adapter';
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

  it('auth guard allows active sessions', () => {
    const injector = Injector.create({
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            snapshot: () => ({ active: true }),
          },
        },
        { provide: Router, useValue: { parseUrl: (value: string) => `URL:${value}` } },
        { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: {} },
      ],
    });

    expect(runInInjectionContext(injector, () => stynxAuthGuard({} as never, {} as never))).toBe(true);
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

  it('handles inactive login, refresh failure, login redirect, logout, and permission helpers', async () => {
    let authorizeCalls = 0;
    let logoffCalls = 0;
    const tenantContext = new TenantContextService({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const service = new StynxSessionService(
      tenantContext,
      {
        checkAuth: async () => ({
          isAuthenticated: false,
          accessToken: '',
          idToken: '',
          userData: {},
          configId: 'default',
        }),
        authorize: () => {
          authorizeCalls += 1;
        },
        logoff: async () => {
          logoffCalls += 1;
        },
        forceRefreshSession: async () => ({
          isAuthenticated: false,
          accessToken: '',
          idToken: '',
          userData: {},
          configId: 'default',
        }),
      },
      {
        exchangeCognitoToken: async () => {
          throw new Error('not used');
        },
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

    service.login();
    expect(authorizeCalls).toBe(1);
    await expect(service.completeLogin()).resolves.toMatchObject({ active: false });
    await expect(service.refresh()).resolves.toBeNull();
    expect(service.hasAnyPermissions(['missing'])).toBe(false);
    await service.logout();
    expect(logoffCalls).toBe(1);
  });

  it('resolves tenant from callback URL, refreshes active sessions, and rejects tenant switch without a token', async () => {
    let logoutToken = '';
    const tenantContext = new TenantContextService({}, null);
    const refreshedToken = createJwt({ sub: 'user-1', tenant_id: 'tenant-url', scope: 'document:read:* document:write:*' });
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
          accessToken: refreshedToken,
          idToken: '',
          userData: {},
          configId: 'default',
        }),
      },
      {
        exchangeCognitoToken: async (_token, tenantId) => ({
          sid: `sid-${tenantId}`,
          accessToken: createJwt({ sub: 'user-1', tenant_id: tenantId, scope: 'document:read:* document:write:*' }),
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          refreshToken: `refresh-${tenantId}`,
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        }),
        switchTenant: async () => {
          throw new Error('not used');
        },
        logout: async (accessToken) => {
          logoutToken = accessToken;
        },
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

    await service.completeLogin('https://app.example.test/callback?tenantId=tenant-url');
    expect(service.hasAllPermissions(['document:read:*', 'document:write:*'])).toBe(true);
    await expect(service.refresh()).resolves.toMatch(/\./u);
    await expect(service.getAccessToken()).resolves.toMatch(/\./u);
    await service.logout();
    expect(logoutToken).toMatch(/\./u);

    await expect(service.switchTenant('tenant-next')).rejects.toThrow('No active STYNX access token');
  });

  it('parses JWT payloads and persists refresh tokens in storage and cookies', () => {
    const token = createJwt({ permissions: ['a', 'b'], scope: 'ignored' });
    expect(normalizePermissions(parseJwtPayload(token))).toEqual(['a', 'b']);
    expect(normalizePermissions(null)).toEqual([]);
    expect(normalizePermissions({ scope: 'read write ' })).toEqual(['read', 'write']);
    expect(normalizePermissions({ permissions: ' read  write ' })).toEqual(['read', 'write']);
    expect(normalizePermissions({ permissions: ['a', 42, '  ', 'b'] })).toEqual(['a', 'b']);
    expect(normalizePermissions({ permissions: 42 })).toEqual([]);
    expect(parseJwtPayload('not-a-jwt')).toBeNull();
    expect(parseJwtPayload(`h.${Buffer.from('not-json', 'utf8').toString('base64url')}.s`)).toBeNull();

    const backing = new Map<string, string>();
    const storage = new RefreshTokenStorage('refresh', 'session-storage', {
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => backing.set(key, value),
      removeItem: (key) => backing.delete(key),
    });
    storage.write('token-1');
    expect(storage.read()).toBe('token-1');
    storage.write(null);
    expect(storage.read()).toBeNull();
    storage.clear();
    expect(storage.read()).toBeNull();

    const missingStorage = new RefreshTokenStorage('refresh', 'session-storage', null);
    missingStorage.write('ignored');
    expect(missingStorage.read()).toBeNull();

    const defaultStorage = new RefreshTokenStorage('refresh');
    defaultStorage.write(null);
    expect(defaultStorage.read()).toBeNull();

    const serverCookieStorage = new RefreshTokenStorage('refresh', 'cookie', null, null);
    serverCookieStorage.write('ignored');
    serverCookieStorage.clear();
    expect(serverCookieStorage.read()).toBeNull();

    const cookieDocument = { cookie: '' };
    const cookieStorage = new RefreshTokenStorage('refresh', 'cookie', null, cookieDocument as Document, {
      name: 'refresh',
      path: '/app',
      sameSite: 'Strict',
      secure: false,
    });
    cookieStorage.write('cookie-token');
    expect(cookieDocument.cookie).toContain('refresh=cookie-token');
    cookieDocument.cookie = 'refresh=cookie-token; other=value';
    expect(cookieStorage.read()).toBe('cookie-token');
    cookieDocument.cookie = 'other=value';
    expect(cookieStorage.read()).toBeNull();
    cookieStorage.clear();
    expect(cookieDocument.cookie).toContain('Max-Age=0');

    const secureCookieDocument = { cookie: '' };
    new RefreshTokenStorage('refresh', 'cookie', null, secureCookieDocument as Document).write('secure-token');
    expect(secureCookieDocument.cookie).toContain('Secure');

    const originalAtob = globalThis.atob;
    Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true });
    expect(parseJwtPayload(createJwt({ scope: ['array-scope', 42] }))).toEqual({ scope: ['array-scope', 42] });
    Object.defineProperty(globalThis, 'atob', { value: originalAtob, configurable: true });
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
      expect(() => directive.ngOnDestroy()).not.toThrow();
    });
  });

  it('calls auth backend endpoints with normalized URLs and headers', async () => {
    const bundle: StynxSessionBundle = {
      sid: 'sid-1',
      accessToken: 'access-token',
      accessTokenExpiresAt: '2026-01-01T00:00:00.000Z',
      refreshToken: 'refresh-token',
      expiresAt: '2026-01-01T00:00:00.000Z',
      idleExpiresAt: '2026-01-01T00:00:00.000Z',
    };
    const calls: Array<{ url: string; body: unknown; headers: HttpHeaders }> = [];
    const backend = new HttpAuthBackend(
      {
        post: (url: string, body: unknown, options: { headers: HttpHeaders }) => {
          calls.push({ url, body, headers: options.headers });
          return of(bundle);
        },
      } as never,
      { apiBaseUrl: 'https://api.example.test/' },
    );

    await expect(backend.exchangeCognitoToken('cognito-token', 'tenant-a')).resolves.toEqual(bundle);
    await expect(backend.switchTenant('access-token', 'tenant-b')).resolves.toEqual(bundle);
    await expect(backend.logout('access-token')).resolves.toBeUndefined();

    expect(calls.map((call) => call.url)).toEqual([
      'https://api.example.test/sessions',
      'https://api.example.test/sessions/switch',
      'https://api.example.test/sessions/logout',
    ]);
    expect(calls[0]?.body).toEqual({ cognitoToken: 'cognito-token' });
    expect(calls[0]?.headers.get('x-tenant-id')).toBe('tenant-a');
    expect(calls[1]?.body).toEqual({ tenantId: 'tenant-b' });
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer access-token');
    expect(calls[1]?.headers.get('x-tenant-id')).toBe('tenant-b');
    expect(calls[2]?.body).toEqual({});
    expect(calls[2]?.headers.get('authorization')).toBe('Bearer access-token');
  });

  it('adapts OIDC calls and redirect/logout components to session methods', async () => {
    const oidcCalls: unknown[] = [];
    const adapter = new OidcClientAdapter({
      checkAuth: (url?: string) => {
        oidcCalls.push(['checkAuth', url]);
        return of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' });
      },
      authorize: (...args: unknown[]) => {
        oidcCalls.push(['authorize', ...args]);
      },
      logoff: () => {
        oidcCalls.push(['logoff']);
        return of(null);
      },
      forceRefreshSession: () => {
        oidcCalls.push(['forceRefreshSession']);
        return of({ isAuthenticated: false, accessToken: '', idToken: '', userData: {}, configId: 'default' });
      },
    } as never);

    await expect(adapter.checkAuth('https://app.example.test/callback')).resolves.toMatchObject({ isAuthenticated: true });
    adapter.authorize({ customParams: { prompt: 'login' } } as never);
    await expect(adapter.logoff()).resolves.toBeUndefined();
    await expect(adapter.forceRefreshSession()).resolves.toMatchObject({ isAuthenticated: false });
    expect(oidcCalls).toEqual([
      ['checkAuth', 'https://app.example.test/callback'],
      ['authorize', undefined, { customParams: { prompt: 'login' } }],
      ['logoff'],
      ['forceRefreshSession'],
    ]);

    const sessionCalls: unknown[] = [];
    const session = {
      completeLogin: async (url?: string) => {
        sessionCalls.push(['completeLogin', url]);
      },
      logout: async () => {
        sessionCalls.push(['logout']);
      },
    };
    await new StynxLoginRedirectComponent(session as never).ngOnInit();
    await new StynxLogoutButtonComponent(session as never).logout();
    expect(sessionCalls).toEqual([
      ['completeLogin', globalThis.window?.location.href],
      ['logout'],
    ]);
  });

  it('refreshes and logs out inactive sessions without backend calls', async () => {
    let logoffCalls = 0;
    let backendLogoutCalls = 0;
    const service = new StynxSessionService(
      new TenantContextService({}, null),
      {
        checkAuth: async () => ({ isAuthenticated: false, accessToken: '', idToken: '', userData: {}, configId: 'default' }),
        authorize: () => undefined,
        logoff: async () => {
          logoffCalls += 1;
        },
        forceRefreshSession: async () => {
          throw new Error('not used without tenant');
        },
      },
      {
        exchangeCognitoToken: async () => {
          throw new Error('not used');
        },
        switchTenant: async () => {
          throw new Error('not used');
        },
        logout: async () => {
          backendLogoutCalls += 1;
        },
      },
      {
        oidc: {
          authority: 'https://issuer.example.test',
          clientId: 'client-id',
          redirectUrl: 'https://app.example.test/login/callback',
          postLogoutRedirectUri: 'https://app.example.test',
          scope: 'openid',
          responseType: 'code',
        },
      },
    );

    await expect(service.refresh()).resolves.toBeNull();
    await service.onAuthFailure();
    await service.logout();
    expect(logoffCalls).toBe(1);
    expect(backendLogoutCalls).toBe(0);
  });

  it('resolves tenant ids from token claims and rejects missing tenant context', async () => {
    const tenantContext = new TenantContextService({}, null);
    const service = new StynxSessionService(
      tenantContext,
      {
        checkAuth: async () => ({
          isAuthenticated: true,
          accessToken: createJwt({ sub: 'oidc-sub', tenantId: 'tenant-token' }),
          idToken: '',
          userData: {},
          configId: 'default',
        }),
        authorize: () => undefined,
        logoff: async () => undefined,
        forceRefreshSession: async () => ({ isAuthenticated: false, accessToken: '', idToken: '', userData: {}, configId: 'default' }),
      },
      {
        exchangeCognitoToken: async (_token, tenantId) => ({
          sid: 'sid-1',
          accessToken: createJwt({ sub: 'user-1', tenant_id: tenantId }),
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
          scope: 'openid',
          responseType: 'code',
        },
      },
    );

    await expect(service.completeLogin()).resolves.toMatchObject({ tenantId: 'tenant-token' });

    const missingTenant = new StynxSessionService(
      new TenantContextService({}, null),
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
        forceRefreshSession: async () => ({ isAuthenticated: false, accessToken: '', idToken: '', userData: {}, configId: 'default' }),
      },
      {
        exchangeCognitoToken: async () => {
          throw new Error('not used');
        },
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
          scope: 'openid',
          responseType: 'code',
        },
      },
    );
    await expect(missingTenant.completeLogin()).rejects.toThrow('Tenant context is required for session exchange');
  });
});
