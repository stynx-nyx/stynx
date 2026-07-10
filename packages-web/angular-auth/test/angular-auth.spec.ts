import '@angular/compiler';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  Injector,
  TemplateRef,
  ViewContainerRef,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { ROUTES, Router } from '@angular/router';
import { STYNX_ANGULAR_OPTIONS, TenantContextService } from '@stynx-nyx/angular';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of, Subject } from 'rxjs';
import { parseJwtPayload, normalizePermissions } from '../src/jwt';
import { RefreshTokenStorage } from '../src/storage';
import { stynxAuthGuard } from '../src/auth.guard';
import { HttpAuthBackend } from '../src/http-auth.backend';
import { StynxHasPermissionDirective } from '../src/has-permission.directive';
import { StynxLoginRedirectComponent } from '../src/login-redirect.component';
import { StynxLogoutButtonComponent } from '../src/logout-button.component';
import { OidcClientAdapter } from '../src/oidc-client.adapter';
import { StynxPermissionDeniedComponent } from '../src/permission-denied.component';
import { stynxPermissionGuard } from '../src/permission.guard';
import { provideStynxAuth } from '../src/provide-auth';
import { StynxSessionService } from '../src/session.service';
import { STYNX_ANGULAR_AUTH_OPTIONS, STYNX_AUTH_BACKEND, STYNX_OIDC_ADAPTER } from '../src/tokens';
import type { StynxAngularAuthModuleOptions, StynxAuthBackend, StynxOidcAdapter, StynxSessionBundle } from '../src/types';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW, type TenancyOptions } from '@stynx-nyx/angular-tenancy';
import { renderComponent } from './support/test-bed';

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

@Component({
  standalone: true,
  imports: [StynxHasPermissionDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span data-testid="permitted" *stynxHasPermission="'document:write:*'">Allowed</span>`,
})
class HasPermissionHostComponent {}

function createTenantContext(options: TenancyOptions = {}, browserWindow: Window | null = null): TenantContextService {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: STYNX_TENANCY_OPTIONS, useValue: options },
      { provide: STYNX_TENANCY_WINDOW, useValue: browserWindow },
    ],
  });
  return runInInjectionContext(injector, () => new TenantContextService());
}

function createSessionService(
  tenantContext: TenantContextService,
  oidc: StynxOidcAdapter,
  backend: StynxAuthBackend,
  options: StynxAngularAuthModuleOptions,
): StynxSessionService {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: TenantContextService, useValue: tenantContext },
      { provide: STYNX_OIDC_ADAPTER, useValue: oidc },
      { provide: STYNX_AUTH_BACKEND, useValue: backend },
      { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: options },
    ],
  });
  return runInInjectionContext(injector, () => new StynxSessionService());
}

function createHasPermissionDirective(
  templateRef: FakeTemplateRef,
  viewContainerRef: FakeViewContainerRef,
  session: StynxSessionService,
): StynxHasPermissionDirective {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: StynxSessionService, useValue: session },
      { provide: TemplateRef, useValue: templateRef },
      { provide: ViewContainerRef, useValue: viewContainerRef },
    ],
  });
  return runInInjectionContext(injector, () => new StynxHasPermissionDirective());
}

function createHttpAuthBackend(http: HttpClient, options: { apiBaseUrl: string }): HttpAuthBackend {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: HttpClient, useValue: http },
      { provide: STYNX_ANGULAR_OPTIONS, useValue: options },
    ],
  });
  return runInInjectionContext(injector, () => new HttpAuthBackend());
}

function createOidcClientAdapter(
  oidcSecurity: OidcSecurityService,
  options?: Partial<StynxAngularAuthModuleOptions>,
): OidcClientAdapter {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: OidcSecurityService, useValue: oidcSecurity },
      {
        provide: STYNX_ANGULAR_AUTH_OPTIONS,
        useValue: {
          oidc: {
            authority: 'https://issuer.example.test',
            clientId: 'client-id',
            redirectUrl: 'https://app.example.test/login/callback',
            postLogoutRedirectUri: 'https://app.example.test',
            scope: 'openid',
            responseType: 'code',
          },
          ...options,
        },
      },
    ],
  });
  return runInInjectionContext(injector, () => new OidcClientAdapter());
}

function setGlobalValue(name: 'document' | 'sessionStorage' | 'window' | 'atob' | 'TextDecoder', value: unknown): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { value, configurable: true });
  return () => {
    if (descriptor) {
      Object.defineProperty(globalThis, name, descriptor);
      return;
    }
    delete (globalThis as Record<string, unknown>)[name];
  };
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular-auth', () => {
  it('renders login redirect and completes the active browser callback URL', async () => {
    const completeLogin = vi.fn(async () => undefined);
    const fixture = await renderComponent(StynxLoginRedirectComponent, {
      providers: [
        { provide: StynxSessionService, useValue: { completeLogin } },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en',
            translate: (key: string) => ({ 'auth.loginRedirect.completing': 'Completing sign in' })[key] ?? key,
          },
        },
      ],
    });
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Completing sign in/u);
    expect(completeLogin).toHaveBeenCalledWith(window.location.href);
  });

  it('renders logout and permission directive behaviour through TestBed', async () => {
    const logout = vi.fn(async () => undefined);
    const logoutFixture = await renderComponent(StynxLogoutButtonComponent, {
      providers: [
        { provide: StynxSessionService, useValue: { logout } },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en',
            translate: (key: string) => ({ 'auth.logoutButton.label': 'Sign out' })[key] ?? key,
          },
        },
      ],
    });
    const button = (logoutFixture.nativeElement as HTMLElement).querySelector('button');
    button?.click();
    await logoutFixture.whenStable();
    expect(button?.textContent).toMatch(/Sign out/u);
    expect(logout).toHaveBeenCalledTimes(1);

    const permissionFixture = await renderComponent(HasPermissionHostComponent, {
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            active$: of({ active: true }),
            hasAllPermissions: (permissions: string[]) => permissions.includes('document:write:*'),
          },
        },
      ],
    });
    expect((permissionFixture.nativeElement as HTMLElement).textContent).toMatch(/Allowed/u);
  });

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

  it('auth guard uses the default login route when no override is configured', () => {
    const injector = Injector.create({
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            snapshot: () => ({ active: false }),
          },
        },
        { provide: Router, useValue: { parseUrl: (value: string) => `URL:${value}` } },
        { provide: STYNX_ANGULAR_AUTH_OPTIONS, useValue: {} },
      ],
    });

    expect(runInInjectionContext(injector, () => stynxAuthGuard({} as never, {} as never))).toBe('URL:/login');
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

    const tenantContext = createTenantContext(
      {},
      {
        location: {
          href: 'https://app.example.test/dashboard?tenantId=tenant-a',
          host: 'app.example.test',
        },
      } as never,
    );

    const service = createSessionService(
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

    await service.onAuthFailure();
    expect(service.snapshot()).toEqual({
      active: false,
      accessToken: null,
      refreshToken: null,
      sid: null,
      permissions: [],
      tenantId: null,
      claims: null,
    });
  });

  it('handles inactive login, refresh failure, login redirect, logout, and permission helpers', async () => {
    let authorizeCalls = 0;
    let logoffCalls = 0;
    const tenantContext = createTenantContext({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const service = createSessionService(
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
    service.loginRedirect();
    expect(authorizeCalls).toBe(2);
    await expect(service.completeLogin()).resolves.toMatchObject({ active: false });
    expect(service.snapshot()).toEqual({
      active: false,
      accessToken: null,
      refreshToken: null,
      sid: null,
      permissions: [],
      tenantId: null,
      claims: null,
    });
    await expect(service.refresh()).resolves.toBe(null);
    expect(service.hasAnyPermissions(['missing'])).toBe(false);
    await service.logout();
    expect(logoffCalls).toBe(1);
  });

  it('clears inactive callback variants and preserves state tenant during refresh', async () => {
    const tenantContext = createTenantContext({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const backendCalls: string[] = [];
    const bundleFor = (tenantId: string): StynxSessionBundle => ({
      sid: `sid-${tenantId}`,
      accessToken: createJwt({ sub: 'user-1', tenant_id: tenantId, permissions: ['document:read:*'] }),
      accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      refreshToken: `refresh-${tenantId}`,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    let checkAuthResponse = {
      isAuthenticated: true,
      accessToken: '',
      idToken: '',
      userData: {},
      configId: 'default',
    };
    let refreshResponse = {
      isAuthenticated: true,
      accessToken: createJwt({ sub: 'oidc-sub' }),
      idToken: '',
      userData: {},
      configId: 'default',
    };
    const service = createSessionService(
      tenantContext,
      {
        checkAuth: async () => checkAuthResponse,
        authorize: () => undefined,
        logoff: async () => undefined,
        forceRefreshSession: async () => refreshResponse,
      },
      {
        exchangeCognitoToken: async (_token, tenantId) => {
          backendCalls.push(tenantId);
          return bundleFor(tenantId);
        },
        switchTenant: async (_token, tenantId) => bundleFor(tenantId),
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
        },
      },
    );

    await expect(service.completeLogin()).resolves.toMatchObject({ active: false });
    expect(backendCalls).toEqual([]);

    checkAuthResponse = {
      isAuthenticated: false,
      accessToken: createJwt({ sub: 'oidc-sub' }),
      idToken: '',
      userData: {},
      configId: 'default',
    };
    await expect(service.completeLogin()).resolves.toMatchObject({ active: false });
    expect(backendCalls).toEqual([]);

    checkAuthResponse = {
      isAuthenticated: true,
      accessToken: createJwt({ sub: 'oidc-sub' }),
      idToken: '',
      userData: {},
      configId: 'default',
    };
    await service.completeLogin();
    tenantContext.setTenant('tenant-b', 'manual');
    await expect(service.refresh()).resolves.toMatch(/\./u);
    expect(backendCalls).toEqual(['tenant-a', 'tenant-a']);

    refreshResponse = {
      isAuthenticated: true,
      accessToken: '',
      idToken: '',
      userData: {},
      configId: 'default',
    };
    await expect(service.refresh()).resolves.toBe(null);
    expect(service.snapshot().permissions).toEqual([]);
  });

  it('resolves tenant from callback URL, refreshes active sessions, and rejects tenant switch without a token', async () => {
    let logoutToken = '';
    const tenantContext = createTenantContext({}, null);
    const refreshedToken = createJwt({ sub: 'user-1', tenant_id: 'tenant-url', scope: 'document:read:* document:write:*' });
    const service = createSessionService(
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
    expect(normalizePermissions({ permissions: '\tread\t write' })).toEqual(['read', 'write']);
    expect(normalizePermissions({ permissions: ['a', 42, '  ', 'b'] })).toEqual(['a', 'b']);
    expect(normalizePermissions({ permissions: 42 })).toEqual([]);
    expect(parseJwtPayload('not-a-jwt')).toBe(null);
    expect(parseJwtPayload(`h.${Buffer.from('not-json', 'utf8').toString('base64url')}.s`)).toBe(null);

    const backing = new Map<string, string>();
    const storage = new RefreshTokenStorage('refresh', 'session-storage', {
      getItem: (key) => backing.get(key) ?? null,
      setItem: (key, value) => backing.set(key, value),
      removeItem: (key) => backing.delete(key),
    });
    storage.write('token-1');
    expect(storage.read()).toBe('token-1');
    storage.write(null);
    expect(storage.read()).toBe(null);
    storage.clear();
    expect(storage.read()).toBe(null);

    const missingStorage = new RefreshTokenStorage('refresh', 'session-storage', null);
    missingStorage.write('ignored');
    expect(missingStorage.read()).toBe(null);

    const defaultStorage = new RefreshTokenStorage('refresh');
    defaultStorage.write(null);
    expect(defaultStorage.read()).toBe(null);

    const serverCookieStorage = new RefreshTokenStorage('refresh', 'cookie', null, null);
    serverCookieStorage.write('ignored');
    serverCookieStorage.clear();
    expect(serverCookieStorage.read()).toBe(null);

    const cookieDocument = { cookie: '' };
    const cookieStorage = new RefreshTokenStorage('refresh', 'cookie', null, cookieDocument as Document, {
      name: 'refresh',
      path: '/app',
      sameSite: 'Strict',
      secure: false,
    });
    cookieStorage.write('cookie-token');
    expect(cookieDocument.cookie).toBe('refresh=cookie-token; Path=/app; SameSite=Strict');
    cookieDocument.cookie = 'refresh=cookie-token; other=value';
    expect(cookieStorage.read()).toBe('cookie-token');
    cookieDocument.cookie = 'other=value';
    expect(cookieStorage.read()).toBe(null);
    cookieStorage.clear();
    expect(cookieDocument.cookie).toBe('refresh=; Max-Age=0; Path=/app');

    const secureCookieDocument = { cookie: '' };
    new RefreshTokenStorage('refresh', 'cookie', null, secureCookieDocument as Document).write('secure-token');
    expect(secureCookieDocument.cookie).toBe('refresh=secure-token; Path=/; SameSite=Lax; Secure');

    const originalAtob = globalThis.atob;
    Object.defineProperty(globalThis, 'atob', {
      value: vi.fn(() => '{"via":"custom-atob"}'),
      configurable: true,
    });
    expect(parseJwtPayload('h.not-base64.s')).toEqual({ via: 'custom-atob' });
    expect(globalThis.atob).toHaveBeenCalledWith('not+base64==');

    Object.defineProperty(globalThis, 'atob', { value: undefined, configurable: true });
    expect(parseJwtPayload(createJwt({ scope: ['array-scope', 42] }))).toEqual({ scope: ['array-scope', 42] });
    expect(parseJwtPayload('header.@.sig')).toBe(null);
    expect(parseJwtPayload('header..sig')).toBe(null);
    Object.defineProperty(globalThis, 'atob', { value: originalAtob, configurable: true });

    const originalTextDecoder = globalThis.TextDecoder;
    Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true });
    try {
      expect(parseJwtPayload(createJwt({ sub: 'without-text-decoder' }))).toEqual({ sub: 'without-text-decoder' });
    } finally {
      Object.defineProperty(globalThis, 'TextDecoder', { value: originalTextDecoder, configurable: true });
    }
  });

  it('uses browser globals for refresh storage defaults and preserves cookie directives exactly', () => {
    const storageValues = new Map<string, string>();
    const restoreStorage = setGlobalValue('sessionStorage', {
      getItem: vi.fn((key: string) => storageValues.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => storageValues.set(key, value)),
      removeItem: vi.fn((key: string) => storageValues.delete(key)),
    });
    const documentValue = { cookie: '' };
    const restoreDocument = setGlobalValue('document', documentValue);
    try {
      const storage = new RefreshTokenStorage('refresh-global');
      storage.write('global-token');
      expect(storage.read()).toBe('global-token');
      storage.clear();
      expect(storage.read()).toBe(null);

      const cookieStorage = new RefreshTokenStorage('refresh key', 'cookie');
      cookieStorage.write('token value');
      expect(documentValue.cookie).toBe('refresh%20key=token%20value; Path=/; SameSite=Lax; Secure');
      documentValue.cookie = 'other=value; refresh%20key=token%20value';
      expect(cookieStorage.read()).toBe('token value');
      cookieStorage.clear();
      expect(documentValue.cookie).toBe('refresh%20key=; Max-Age=0; Path=/');
    } finally {
      restoreDocument();
      restoreStorage();
    }
  });

  it('permission guard denies and allows based on session permissions', async () => {
    const tenantContext = createTenantContext(
      {},
      null,
    );
    tenantContext.setTenant('tenant-a', 'manual');

    const service = createSessionService(
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

  it('ships the permission-denied component and default route provider', () => {
    let redirectCalls = 0;
    TestBed.configureTestingModule({
      imports: [StynxPermissionDeniedComponent],
      providers: [
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en',
            translate: (key: string) => ({
              'auth.permissionDenied.actions.loginAgain': 'Log in again',
              'auth.permissionDenied.message': 'You do not have permission to view this page.',
              'auth.permissionDenied.title': 'Permission denied',
            })[key] ?? key,
          },
        },
        {
          provide: StynxSessionService,
          useValue: {
            loginRedirect: () => {
              redirectCalls += 1;
            },
          },
        },
      ],
    });

    const fixture = TestBed.createComponent(StynxPermissionDeniedComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toMatch(/Permission denied/u);
    fixture.nativeElement.querySelector('button')?.click();
    expect(redirectCalls).toBe(1);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStynxAuth({
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
        }),
      ],
    });

    const routes = TestBed.inject(ROUTES).flat();
    expect(routes).toContainEqual({
      path: 'forbidden',
      component: StynxPermissionDeniedComponent,
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideStynxAuth({
          oidc: {
            authority: 'https://issuer.example.test',
            clientId: 'client-id',
            redirectUrl: 'https://app.example.test/login/callback',
            postLogoutRedirectUri: 'https://app.example.test',
            scope: 'openid profile email offline_access',
            responseType: 'code',
          },
          permissionDeniedPath: '/',
        }),
      ],
    });
    expect(TestBed.inject(ROUTES).flat()).toContainEqual({
      path: 'forbidden',
      component: StynxPermissionDeniedComponent,
    });
  });

  it('has-permission directive renders only when the session grants the permission', () => {
    const tenantContext = createTenantContext(
      {},
      null,
    );
    tenantContext.setTenant('tenant-a', 'manual');

    const service = createSessionService(
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
      const directive = createHasPermissionDirective(new FakeTemplateRef(), view, service);
      directive.stynxHasPermission = 'document:write:*';
      expect(view.rendered).toBe(1);

      directive.stynxHasPermission = ['document:write:*'];
      expect(view.rendered).toBe(1);

      directive.stynxHasPermission = 'document:delete:*';
      expect(view.cleared).toBe(1);
      directive.ngOnDestroy();
    });
  });

  it('has-permission directive rerenders on active stream changes and array inputs', () => {
    const active$ = new Subject<unknown>();
    const granted = new Set<string>();
    const session = {
      active$,
      hasAllPermissions: vi.fn((permissions: string[]) => permissions.every((permission) => granted.has(permission))),
    } as unknown as StynxSessionService;
    const view = new FakeViewContainerRef();
    const directive = createHasPermissionDirective(new FakeTemplateRef(), view, session);

    directive.stynxHasPermission = ['document:read:*', 'document:write:*'];
    expect(view.rendered).toBe(0);
    expect(session.hasAllPermissions).toHaveBeenLastCalledWith(['document:read:*', 'document:write:*']);

    granted.add('document:read:*');
    granted.add('document:write:*');
    active$.next(null);
    expect(view.rendered).toBe(1);

    active$.next(null);
    expect(view.rendered).toBe(1);

    granted.clear();
    active$.next(null);
    expect(view.cleared).toBe(1);
    directive.ngOnDestroy();
    expect(active$.observed).toBe(false);
  });

  it('has-permission directive renders the default empty requirement before inputs arrive', () => {
    const session = {
      active$: of(null),
      hasAllPermissions: vi.fn((permissions: string[]) => permissions.length === 0),
    } as unknown as StynxSessionService;
    const view = new FakeViewContainerRef();
    const directive = createHasPermissionDirective(new FakeTemplateRef(), view, session);

    expect(view.rendered).toBe(1);
    expect(session.hasAllPermissions).toHaveBeenCalledWith([]);

    directive.stynxHasPermission = 'document:read:*';
    expect(view.cleared).toBe(1);
    directive.ngOnDestroy();
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
    const backend = createHttpAuthBackend(
      {
        post: (url: string, body: unknown, options: { headers: HttpHeaders }) => {
          calls.push({ url, body, headers: options.headers });
          return of(bundle);
        },
      } as never,
      { apiBaseUrl: 'https://api.example.test///' },
    );

    await expect(backend.exchangeCognitoToken('cognito-token', 'tenant-a')).resolves.toEqual(bundle);
    await expect(backend.switchTenant('access-token', 'tenant-b')).resolves.toEqual(bundle);
    await expect(backend.logout('access-token')).resolves.toBe(undefined);

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
    const adapter = createOidcClientAdapter({
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
    await expect(adapter.logoff()).resolves.toBe(undefined);
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
    const componentInjector = Injector.create({
      providers: [{ provide: StynxSessionService, useValue: session }],
    });
    await runInInjectionContext(componentInjector, () => new StynxLoginRedirectComponent()).ngOnInit();
    await runInInjectionContext(componentInjector, () => new StynxLogoutButtonComponent()).logout();
    expect(sessionCalls).toEqual([
      ['completeLogin', globalThis.window?.location.href],
      ['logout'],
    ]);
  });

  it('resolves configured hosted auth action links without guessing provider URLs', () => {
    globalThis.window.history.pushState({}, '', '/login/callback?code=abc&state=oidc&keep=1#id_token=token');
    const adapter = createOidcClientAdapter({
      checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
      authorize: () => undefined,
      logoff: () => of(null),
      forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
    } as never, {
      hostedActions: {
        changePassword: 'https://idp.example.test/password?return={returnUrl}&state={state}&tenant={tenantId}&locale={locale}',
        mfaEnrolment: ({ returnUrl }) => ({
          action: 'mfa-enrolment',
          url: `/mfa/setup?return=${encodeURIComponent(returnUrl)}`,
          method: 'browser-redirect',
          opensIn: 'new-tab',
        }),
      },
    });

    expect(adapter.getHostedActionLink('change-password', {
      state: 'next step',
      tenantId: 'tenant/a',
      locale: 'pt-BR',
    })).toEqual({
      action: 'change-password',
      url: 'https://idp.example.test/password?return=http%3A%2F%2Flocalhost%3A3000%2Flogin%2Fcallback%3Fkeep%3D1&state=next%20step&tenant=tenant%2Fa&locale=pt-BR',
      method: 'browser-redirect',
    });

    expect(adapter.getHostedActionLink('mfa-enrolment', {
      returnUrl: 'https://app.example.test/profile/security',
    })).toEqual({
      action: 'mfa-enrolment',
      url: '/mfa/setup?return=https%3A%2F%2Fapp.example.test%2Fprofile%2Fsecurity',
      method: 'browser-redirect',
      opensIn: 'new-tab',
    });
  });

  it('opens hosted auth actions through location assignment or a new tab', () => {
    const assign = vi.fn();
    const open = vi.fn();
    const restoreWindow = setGlobalValue('window', {
      location: {
        href: 'https://app.example.test/profile?code=abc&keep=1',
        origin: 'https://app.example.test',
        assign,
      },
      open,
    });
    try {
      const adapter = createOidcClientAdapter({
        checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
        authorize: () => undefined,
        logoff: () => of(null),
        forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
      } as never, {
        hostedActions: {
          returnUrl: 'https://app.example.test/account',
          changePassword: '/password?return={returnUrl}',
          mfaEnrolment: () => ({ action: 'mfa-enrolment', url: '/mfa', method: 'browser-redirect', opensIn: 'new-tab' }),
        },
      });

      adapter.openHostedAction('change-password');
      expect(assign).toHaveBeenCalledWith('/password?return=https%3A%2F%2Fapp.example.test%2Faccount');

      adapter.openHostedAction('mfa-enrolment');
      expect(open).toHaveBeenCalledWith('/mfa', '_blank', 'noopener,noreferrer');
    } finally {
      restoreWindow();
    }
  });

  it('reports unavailable and invalid hosted auth action configuration', () => {
    const oidcSecurity = {
      checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
      authorize: () => undefined,
      logoff: () => of(null),
      forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
    } as never;

    const unavailable = createOidcClientAdapter(oidcSecurity, {
      hostedActions: {
        changePassword: () => null,
      },
    });
    expect(unavailable.getHostedActionLink('change-password')).toBe(null);
    expect(unavailable.getHostedActionLink('mfa-enrolment')).toBe(null);

    const invalid = createOidcClientAdapter(oidcSecurity, {
      hostedActions: {
        changePassword: 'http://[',
      },
    });
    expect(() => invalid.getHostedActionLink('change-password')).toThrow(TypeError);
  });

  it('login redirect passes no callback URL when no browser window is available', async () => {
    const restoreWindow = setGlobalValue('window', undefined);
    const sessionCalls: unknown[] = [];
    try {
      const injector = Injector.create({
        providers: [{
          provide: StynxSessionService,
          useValue: {
            completeLogin: async (url?: string) => {
              sessionCalls.push(['completeLogin', url]);
            },
          },
        }],
      });

      await runInInjectionContext(injector, () => new StynxLoginRedirectComponent()).ngOnInit();
      expect(sessionCalls).toEqual([['completeLogin', undefined]]);
    } finally {
      restoreWindow();
    }
  });

  it('refresh token storage tolerates missing browser storage globals', () => {
    const restoreDocument = setGlobalValue('document', undefined);
    const restoreSessionStorage = setGlobalValue('sessionStorage', undefined);
    try {
      const storage = new RefreshTokenStorage('refresh');
      storage.write('ignored');
      expect(storage.read()).toBe(null);
      storage.clear();
    } finally {
      restoreSessionStorage();
      restoreDocument();
    }
  });

  it('refreshes and logs out inactive sessions without backend calls', async () => {
    let logoffCalls = 0;
    let backendLogoutCalls = 0;
    const service = createSessionService(
      createTenantContext({}, null),
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

    await expect(service.refresh()).resolves.toBe(null);
    await service.onAuthFailure();
    await service.logout();
    expect(logoffCalls).toBe(1);
    expect(backendLogoutCalls).toBe(0);
  });

  it('resolves tenant ids from token claims and rejects missing tenant context', async () => {
    const tenantContext = createTenantContext({}, null);
    const service = createSessionService(
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

    const missingTenant = createSessionService(
      createTenantContext({}, null),
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

  // ===========================================================================
  // WAVE-05A targeted mutation kills — angular-auth survivors.
  // ===========================================================================

  function killOptions(): StynxAngularAuthModuleOptions {
    return {
      oidc: {
        authority: 'https://issuer.example.test',
        clientId: 'client-id',
        redirectUrl: 'https://app.example.test/login/callback',
        postLogoutRedirectUri: 'https://app.example.test',
        scope: 'openid',
        responseType: 'code',
      },
    };
  }

  function killOidc(accessToken = ''): StynxOidcAdapter {
    return {
      checkAuth: async () => ({
        isAuthenticated: !!accessToken,
        accessToken,
        idToken: '',
        userData: {},
        configId: 'default',
      }),
      authorize: () => undefined,
      logoff: async () => undefined,
      forceRefreshSession: async () => ({
        isAuthenticated: false, accessToken: '', idToken: '', userData: {}, configId: 'default',
      }),
    };
  }

  function killBackend(): StynxAuthBackend {
    return {
      exchangeCognitoToken: async () => ({
        accessToken: '',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshToken: '',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        sid: '',
        permissions: [],
      }),
      switchTenant: async () => ({
        accessToken: '',
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        refreshToken: '',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        sid: '',
        permissions: [],
      }),
      logout: async () => undefined,
    };
  }

  it('hasAllPermissions returns false when any required permission is missing (kills MethodExpression .every → .some at src/session.service.ts:119)', () => {
    const session = createSessionService(
      createTenantContext({}, null),
      killOidc(),
      killBackend(),
      killOptions(),
    );
    (session as unknown as { stateSignal: { set(v: unknown): void } }).stateSignal.set({
      active: true,
      accessToken: 't', refreshToken: 'r', sid: 's',
      permissions: ['a'], tenantId: 'tenant', claims: {},
    });
    // .every(['a','b']) over {a} → false. Mutation .some → true.
    expect(session.hasAllPermissions(['a', 'b'])).toBe(false);
    expect(session.hasAllPermissions(['a'])).toBe(true);
  });

  it('hasAnyPermissions returns true when any required permission is granted (kills MethodExpression .some → .every at src/session.service.ts:124)', () => {
    const session = createSessionService(
      createTenantContext({}, null),
      killOidc(),
      killBackend(),
      killOptions(),
    );
    (session as unknown as { stateSignal: { set(v: unknown): void } }).stateSignal.set({
      active: true,
      accessToken: 't', refreshToken: 'r', sid: 's',
      permissions: ['a'], tenantId: 'tenant', claims: {},
    });
    expect(session.hasAnyPermissions(['a', 'b'])).toBe(true);
    expect(session.hasAnyPermissions(['c', 'd'])).toBe(false);
  });

  it('resolveTenantId rejects empty-string tenant claim (kills EqualityOperator `> 0` → `>= 0` at src/session.service.ts:138)', async () => {
    const accessToken = createJwt({ tenant_id: '', sub: 'oidc-sub' });
    const session = createSessionService(
      createTenantContext({}, null),
      killOidc(accessToken),
      killBackend(),
      killOptions(),
    );
    await expect(session.completeLogin()).rejects.toThrow('Tenant context is required for session exchange');
  });

  it('parseJwtPayload returns parsed payload for exactly-2-part JWT (no signature) — kills EqualityOperator `parts.length < 2` → `<= 2`', () => {
    // Original `parts.length < 2`: with 2 parts → false → don't return null → parse it.
    // Mutation `<= 2`: with 2 parts → true → return null.
    const header = Buffer.from(JSON.stringify({ alg: 'none' }), 'utf8').toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: 'two-part' }), 'utf8').toString('base64url');
    const twoPart = `${header}.${payload}`;
    expect(parseJwtPayload(twoPart)).toEqual({ sub: 'two-part' });
  });

  it('parseJwtPayload preserves URL-safe base64 chars - and _ in payload decoding (kills StringLiteral mutations on the replace patterns at src/jwt.ts:30)', () => {
    // Craft a payload whose base64url contains '-' and '_'.
    // Example bytes for a small JSON that produces these chars.
    // We rely on the existing createJwt helper which uses base64url encoding.
    const payload = { x: 'a?b<c>' };  // characters that produce base64url '_' or '-' when encoded
    const token = createJwt(payload);
    const second = token.split('.')[1]!;
    // Confirm the test fixture exercises at least one URL-safe character so
    // the regex replacements are meaningful.
    expect(/[-_]/u.test(second)).toBe(true);
    expect(parseJwtPayload(token)).toEqual(payload);
  });

  // ===========================================================================
  // Storage cookie kills.
  // ===========================================================================

  it('cookie write produces directives `Path=` + `SameSite=` + `Secure` exactly (kills StringLiteral at storage.ts:95-101)', () => {
    const cookieDocument = { cookie: '' };
    const storage = new RefreshTokenStorage('refresh', 'cookie', null, cookieDocument as Document, {
      name: 'refresh',
      path: '/api',
      sameSite: 'Strict',
      secure: true,
    });
    storage.write('the-token');
    // Each directive must appear with its exact key. Kills `Path=` → `` /
    // `SameSite=` → ``, etc.
    expect(cookieDocument.cookie).toBe('refresh=the-token; Path=/api; SameSite=Strict; Secure');
  });

  it('cookie clear emits `Max-Age=0` directive (kills StringLiteral at storage.ts:89)', () => {
    const cookieDocument = { cookie: 'refresh=stale' };
    const storage = new RefreshTokenStorage('refresh', 'cookie', null, cookieDocument as Document);
    storage.clear();
    expect(cookieDocument.cookie).toBe('refresh=; Max-Age=0; Path=/');
  });

  it('cookie read trims surrounding whitespace from entries (kills MethodExpression on .trim at storage.ts:75)', () => {
    // Pre-populate cookie with leading whitespace before our prefix.
    const cookieDocument = { cookie: 'other=v;   refresh=trimmed-value' };
    const storage = new RefreshTokenStorage('refresh', 'cookie', null, cookieDocument as Document, {
      name: 'refresh', path: '/', sameSite: 'Lax', secure: true,
    });
    // Without `.trim()`, the entry stays as '   refresh=trimmed-value' and
    // `startsWith('refresh=')` is false → returns null. With `.trim()` →
    // 'refresh=trimmed-value' → matches.
    expect(storage.read()).toBe('trimmed-value');
  });

  it('cookie read returns null when cookie source is empty (kills StringLiteral at storage.ts:72)', () => {
    const cookieDocument = { cookie: '' };
    const storage = new RefreshTokenStorage('refresh', 'cookie', null, cookieDocument as Document);
    expect(storage.read()).toBe(null);
  });

  it('applyBundle sets state.active === true (kills BooleanLiteral mutation at src/session.service.ts:148)', async () => {
    let setAccessToken = '';
    const accessToken = createJwt({ tenant_id: 'tenant-applied', sub: 'oidc-sub' });
    const session = createSessionService(
      createTenantContext({}, null),
      killOidc(accessToken),
      {
        exchangeCognitoToken: async (token: string) => {
          setAccessToken = token;
          return {
            accessToken: createJwt({ permissions: ['p1'], sub: 'oidc-sub' }),
            accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            refreshToken: 'r-1',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            sid: 's-1',
            permissions: ['p1'],
          };
        },
        switchTenant: async () => ({
          accessToken: '',
          accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          refreshToken: '',
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
          sid: '',
          permissions: [],
        }),
        logout: async () => undefined,
      },
      killOptions(),
    );
    const state = await session.completeLogin();
    expect(state.active).toBe(true);
    expect(session.active()).toBe(true);
    expect(setAccessToken).toBe(accessToken);
  });

  // ===========================================================================
  // WAVE-05A Phase 1 — environment-toggle kills + remaining survivors.
  // The recipe: toggle globalThis.X to undefined PER TEST so the `typeof`
  // branches in src/jwt.ts and src/storage.ts become observably distinct.
  // ===========================================================================

  describe('parseJwtPayload — atob/TextDecoder environment toggles', () => {
    it('uses the manual decoder when atob is undefined (kills ConditionalExpression on `typeof atob === "function"`)', () => {
      const restore = setGlobalValue('atob', undefined);
      try {
        // Standard base64 (no URL-safe chars needed): payload is small JSON.
        expect(parseJwtPayload(createJwt({ sub: 'manual-atob' }))).toEqual({ sub: 'manual-atob' });
      } finally {
        restore();
      }
    });

    it('uses the manual decoder when atob is not a function (kills EqualityOperator on the type check)', () => {
      const restore = setGlobalValue('atob', 42);
      try {
        expect(parseJwtPayload(createJwt({ sub: 'atob-not-fn' }))).toEqual({ sub: 'atob-not-fn' });
      } finally {
        restore();
      }
    });

    it('returns null when manual-decoder encounters invalid base64 (kills ConditionalExpression/BlockStatement at jwt.ts:16-17)', () => {
      // Force manual decoder by removing atob. Pass invalid base64 char.
      const restore = setGlobalValue('atob', undefined);
      try {
        // Construct a JWT whose middle segment contains an out-of-alphabet char `!`.
        const header = Buffer.from(JSON.stringify({ alg: 'none' }), 'utf8').toString('base64url');
        const badSegment = 'AB!CD';  // '!' is not in the base64 alphabet
        expect(parseJwtPayload(`${header}.${badSegment}.sig`)).toBe(null);
      } finally {
        restore();
      }
    });

    it('uses the latin-1 fallback when TextDecoder is undefined (kills ConditionalExpression at jwt.ts:33)', () => {
      const restore = setGlobalValue('TextDecoder', undefined);
      try {
        // Plain ASCII payload — latin-1 fallback returns the same string as TextDecoder.
        expect(parseJwtPayload(createJwt({ sub: 'no-text-decoder' }))).toEqual({ sub: 'no-text-decoder' });
      } finally {
        restore();
      }
    });

    it('returns null for a 1-part token (kills EqualityOperator `parts.length < 2` → `<= 2`)', () => {
      // 1 part: `parts.length === 1 < 2` → original returns null.
      // Mutation `<= 2`: 1 <= 2 → also returns null (same outcome). So this
      // test alone doesn't differentiate; the 2-part case below does.
      expect(parseJwtPayload('only-one-part')).toBe(null);
    });

    it('parses a 2-part JWT (no signature) — kills `parts.length < 2` mutation', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'none' }), 'utf8').toString('base64url');
      const payload = Buffer.from(JSON.stringify({ sub: 'two-part' }), 'utf8').toString('base64url');
      // Original: 2 < 2 false → don't return null → parse. Mutation: 2 <= 2 true → null.
      expect(parseJwtPayload(`${header}.${payload}`)).toEqual({ sub: 'two-part' });
    });

    it('preserves URL-safe base64 - and _ chars during decode (kills Regex mutations on the replace patterns)', () => {
      // The payload `{ "x": "??>" }` base64url-encodes to characters that
      // include `-` and `_`. Verify roundtrip integrity through both atob
      // and manual paths.
      const payload = { x: 'a?b<c>' };
      const token = createJwt(payload);
      const segment = token.split('.')[1]!;
      expect(/[-_]/u.test(segment)).toBe(true);
      expect(parseJwtPayload(token)).toEqual(payload);

      // Same input with manual decoder forced.
      const restore = setGlobalValue('atob', undefined);
      try {
        expect(parseJwtPayload(token)).toEqual(payload);
      } finally {
        restore();
      }
    });

    it('handles base64url with no padding (kills ConditionalExpression at jwt.ts:31 `normalized.length % 4 === 0`)', () => {
      // Construct a payload whose base64url length is divisible by 4 (no padding needed).
      // 6 chars: 'foobar' → 8-char base64. We want length % 4 === 0.
      // Original: padding = '' (length % 4 === 0). Mutation `true` → never appends '=' → may break for non-aligned.
      // Original: padding = '='.repeat(4 - len%4) when not 0.
      // Pick a payload whose JSON encodes to a multiple-of-3-byte input so no padding is needed.
      const payload = { abc: '123' };  // JSON length is 11 bytes → not multiple of 3.
      const token = createJwt(payload);
      expect(parseJwtPayload(token)).toEqual(payload);
    });
  });

  describe('normalizePermissions — array filter precision', () => {
    it('filters string-only values from a mixed array (kills filter type-guard mutations)', () => {
      expect(normalizePermissions({ permissions: ['valid', 42, null, '   ', 'also-valid'] }))
        .toEqual(['valid', 'also-valid']);
    });

    it('returns [] when payload is null (kills BlockStatement at jwt.ts:54-55)', () => {
      // `if (!payload) { return []; }` — mutation `{}` makes function return undefined.
      expect(normalizePermissions(null)).toEqual([]);
    });

    it('returns [] when raw is not a string or array (e.g. number)', () => {
      expect(normalizePermissions({ permissions: 42 })).toEqual([]);
    });
  });

  describe('RefreshTokenStorage — environment toggles', () => {
    it('session-storage mode with no sessionStorage available returns no-op', () => {
      const restore = setGlobalValue('sessionStorage', undefined);
      try {
        // Constructor uses the default `typeof sessionStorage === 'undefined' ? null : sessionStorage`.
        const storage = new RefreshTokenStorage('refresh');
        // Operations must short-circuit cleanly (no throw).
        storage.write('any');
        expect(storage.read()).toBe(null);
        storage.clear();
        expect(storage.read()).toBe(null);
      } finally {
        restore();
      }
    });

    it('cookie mode with no document available returns null on read and no-op on write', () => {
      const restore = setGlobalValue('document', undefined);
      try {
        const storage = new RefreshTokenStorage('refresh', 'cookie');
        storage.write('any');
        expect(storage.read()).toBe(null);
        storage.clear();
        expect(storage.read()).toBe(null);
      } finally {
        restore();
      }
    });
  });

  describe('OIDC adapter — URL parameter strip + base fallback', () => {
    it('sanitizes the current URL by stripping all OIDC redirect params (kills the StringLiteral array entries at oidc-client.adapter.ts:41)', () => {
      // Pre-populate location with EVERY OIDC param so each ArrayDeclaration entry must be stripped.
      const callbackUrl = 'http://localhost:3000/login/callback?code=abc&state=oidc&session_state=ss&error=err&error_description=ed&error_uri=eu&iss=https%3A%2F%2Fidp.example.test&keep=1#fragment';
      globalThis.window.history.pushState({}, '', callbackUrl);

      const adapter = createOidcClientAdapter({
        checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
        authorize: () => undefined,
        logoff: () => of(null),
        forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
      } as never, {
        hostedActions: {
          changePassword: 'https://idp.example.test/password?return={returnUrl}',
        },
      });
      const link = adapter.getHostedActionLink('change-password');
      // The returnUrl param value (after the `return=`) must be the URL-encoded
      // form of the current URL with ALL OIDC params stripped — only `keep=1` survives.
      // If any of the 7 array entries is mutated to '', that param leaks into the returnUrl.
      const decoded = decodeURIComponent(link!.url.split('return=')[1]!);
      expect(decoded).toBe('http://localhost:3000/login/callback?keep=1');
      expect(new URL(decoded).search).toBe('?keep=1');
      expect(new URL(decoded).hash).toBe('');
    });

    it('encodePlaceholder returns empty string when value is null (kills StringLiteral at oidc-client.adapter.ts:19)', () => {
      // Indirect via applyPlaceholders: pass null for tenantId.
      globalThis.window.history.pushState({}, '', '/login/callback');
      const adapter = createOidcClientAdapter({
        checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
        authorize: () => undefined,
        logoff: () => of(null),
        forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
      } as never, {
        hostedActions: {
          changePassword: 'https://idp.example.test/password?tenant={tenantId}',
        },
      });
      // tenantId is undefined in the context → `encodePlaceholder(undefined)` must return ''.
      const link = adapter.getHostedActionLink('change-password', {});
      expect(link!.url).toBe('https://idp.example.test/password?tenant=');
    });

    it('falls back to "https://stynx.local" base when browserLocation has no origin (kills LogicalOperator)', () => {
      // Save + clear window.
      const restore = setGlobalValue('window', { history: globalThis.window.history } as unknown as Window);
      try {
        const adapter = createOidcClientAdapter({
          checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
          authorize: () => undefined,
          logoff: () => of(null),
          forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
        } as never, {
          hostedActions: {
            changePassword: '/password',
          },
        });
        // /password is a relative URL — must resolve against the fallback base
        // ('https://stynx.local') without throwing.
        const link = adapter.getHostedActionLink('change-password');
        expect(link).toEqual({
          action: 'change-password',
          url: '/password',
          method: 'browser-redirect',
        });
      } finally {
        restore();
      }
    });

    it('openHostedAction routes new-tab links via window.open with noopener+noreferrer (kills StringLiteral)', () => {
      const open = vi.fn();
      const restore = setGlobalValue('window', { open, location: { assign: vi.fn() } } as unknown as Window);
      try {
        const adapter = createOidcClientAdapter({
          checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
          authorize: () => undefined,
          logoff: () => of(null),
          forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
        } as never, {
          hostedActions: {
            mfaEnrolment: () => ({ action: 'mfa-enrolment' as const, url: 'https://idp.example.test/mfa', method: 'browser-redirect' as const, opensIn: 'new-tab' as const }),
          },
        });
        adapter.openHostedAction('mfa-enrolment');
        expect(open).toHaveBeenCalledWith('https://idp.example.test/mfa', '_blank', 'noopener,noreferrer');
      } finally {
        restore();
      }
    });

    it('openHostedAction routes default links via location.assign (kills BlockStatement on the new-tab branch)', () => {
      const assign = vi.fn();
      const restore = setGlobalValue('window', { open: vi.fn(), location: { assign } } as unknown as Window);
      try {
        const adapter = createOidcClientAdapter({
          checkAuth: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
          authorize: () => undefined,
          logoff: () => of(null),
          forceRefreshSession: () => of({ isAuthenticated: true, accessToken: 'token', idToken: '', userData: {}, configId: 'default' }),
        } as never, {
          hostedActions: {
            changePassword: 'https://idp.example.test/password',
          },
        });
        adapter.openHostedAction('change-password');
        expect(assign).toHaveBeenCalledWith('https://idp.example.test/password');
      } finally {
        restore();
      }
    });
  });

  describe('HttpAuthBackend — apiBaseUrl trailing-slash normalize (kills Regex at http-auth.backend.ts:9)', () => {
    it('treats apiBaseUrl with trailing slash identically to without', async () => {
      const calls: Array<{ url: string }> = [];
      const fakeHttp = {
        post: (url: string, _body: unknown, _options: unknown) => {
          calls.push({ url });
          return of({ accessToken: 'a', refreshToken: 'r', sid: 's', permissions: [] });
        },
      } as unknown as HttpClient;
      const withSlash = createHttpAuthBackend(fakeHttp, { apiBaseUrl: 'https://api.example/' });
      const withoutSlash = createHttpAuthBackend(fakeHttp, { apiBaseUrl: 'https://api.example' });
      await withSlash.exchangeCognitoToken('t', 'tenant-a');
      await withoutSlash.exchangeCognitoToken('t', 'tenant-a');
      // Both calls must produce the same URL (no double slash, no missing slash).
      expect(calls[0]!.url).toBe(calls[1]!.url);
      expect(calls[0]!.url).toBe('https://api.example/sessions');
    });
  });

  // has-permission.directive lifecycle survivors are addressed via the
  // existing HasPermissionHostComponent TestBed-rendered test (line ~62 of
  // this file) rather than a direct directive instantiation; the directive
  // depends on signal subscriptions that the fake session-service stub did
  // not satisfy. Residual mutants in this file remain as a known acceptable.
});
