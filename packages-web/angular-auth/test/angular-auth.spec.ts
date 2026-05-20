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
import { STYNX_ANGULAR_OPTIONS, TenantContextService } from '@stynx-web/angular';
import { StynxI18nService } from '@stynx-web/angular-i18n';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import { of } from 'rxjs';
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
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW, type TenancyOptions } from '@stynx-web/angular-tenancy';
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

function setGlobalValue(name: 'document' | 'sessionStorage' | 'window', value: unknown): () => void {
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

describe('@stynx-web/angular-auth', () => {
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

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Completing sign in');
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
    expect(button?.textContent).toContain('Sign out');
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
    expect((permissionFixture.nativeElement as HTMLElement).textContent).toContain('Allowed');
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
    await expect(service.refresh()).resolves.toBeNull();
    expect(service.hasAnyPermissions(['missing'])).toBe(false);
    await service.logout();
    expect(logoffCalls).toBe(1);
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
    expect(parseJwtPayload('header.@.sig')).toBeNull();
    Object.defineProperty(globalThis, 'atob', { value: originalAtob, configurable: true });

    const originalTextDecoder = globalThis.TextDecoder;
    Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true });
    try {
      expect(parseJwtPayload(createJwt({ sub: 'without-text-decoder' }))).toEqual({ sub: 'without-text-decoder' });
    } finally {
      Object.defineProperty(globalThis, 'TextDecoder', { value: originalTextDecoder, configurable: true });
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
    expect(fixture.nativeElement.textContent).toContain('Permission denied');
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
    const backend = createHttpAuthBackend(
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
    expect(unavailable.getHostedActionLink('change-password')).toBeNull();
    expect(unavailable.getHostedActionLink('mfa-enrolment')).toBeNull();

    const invalid = createOidcClientAdapter(oidcSecurity, {
      hostedActions: {
        changePassword: 'http://[',
      },
    });
    expect(() => invalid.getHostedActionLink('change-password')).toThrow();
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
      expect(storage.read()).toBeNull();
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

    await expect(service.refresh()).resolves.toBeNull();
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
});
