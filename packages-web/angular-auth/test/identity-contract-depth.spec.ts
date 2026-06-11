import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { Router } from '@angular/router';
import { TenantContextService } from '@stynx-web/angular';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from '@stynx-web/angular-tenancy';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { stynxPermissionGuard } from '../src/permission.guard';
import { StynxSessionService } from '../src/session.service';
import {
  STYNX_ANGULAR_AUTH_OPTIONS,
  STYNX_AUTH_BACKEND,
  STYNX_OIDC_ADAPTER,
} from '../src/tokens';
import type { StynxAngularAuthModuleOptions, StynxAuthBackend, StynxOidcAdapter } from '../src/types';

function createJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

function createTenantContext(): TenantContextService {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: STYNX_TENANCY_OPTIONS, useValue: {} },
      { provide: STYNX_TENANCY_WINDOW, useValue: null },
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

function authOptions(overrides: Partial<StynxAngularAuthModuleOptions> = {}): StynxAngularAuthModuleOptions {
  return {
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
    ...overrides,
  };
}

beforeAll(() => {
  try {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  } catch (error) {
    if (!String(error).includes('Cannot set base providers')) {
      throw error;
    }
  }
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-auth W04 identity contract depth', () => {
  it('exposes current actor claims and scope-derived permissions after credential exchange', async () => {
    const tenantContext = createTenantContext();
    tenantContext.setTenant('tenant-a', 'manual');
    const exchangedToken = createJwt({
      sub: 'actor-1',
      email: 'ada@example.test',
      tenant_id: 'tenant-a',
      scope: 'profile:read profile:write',
      'custom:role': 'inspector',
    });
    const backend: StynxAuthBackend = {
      exchangeCognitoToken: vi.fn(async (cognitoToken: string, tenantId: string) => ({
        sid: 'sid-1',
        accessToken: exchangedToken,
        accessTokenExpiresAt: '2026-06-10T12:00:00.000Z',
        refreshToken: `refresh-for-${tenantId}`,
        expiresAt: '2026-06-10T13:00:00.000Z',
        idleExpiresAt: '2026-06-10T12:30:00.000Z',
      })),
      switchTenant: vi.fn(async () => {
        throw new Error('not used');
      }),
      logout: vi.fn(async () => undefined),
    };
    const service = createSessionService(
      tenantContext,
      {
        checkAuth: vi.fn(async () => ({
          isAuthenticated: true,
          accessToken: createJwt({ sub: 'upstream-actor', tenant_id: 'tenant-a' }),
          idToken: '',
          userData: {},
          configId: 'default',
        })),
        authorize: vi.fn(),
        logoff: vi.fn(async () => undefined),
        forceRefreshSession: vi.fn(async () => ({
          isAuthenticated: false,
          accessToken: '',
          idToken: '',
          userData: {},
          configId: 'default',
        })),
      },
      backend,
      authOptions(),
    );

    await expect(service.completeLogin()).resolves.toMatchObject({
      active: true,
      sid: 'sid-1',
      tenantId: 'tenant-a',
      refreshToken: 'refresh-for-tenant-a',
      permissions: ['profile:read', 'profile:write'],
      claims: expect.objectContaining({
        sub: 'actor-1',
        email: 'ada@example.test',
        'custom:role': 'inspector',
      }),
    });
    expect(backend.exchangeCognitoToken).toHaveBeenCalledWith(expect.stringMatching(/\./u), 'tenant-a');
    expect(service.snapshot().claims?.['sub']).toBe('actor-1');
    expect(service.hasAllPermissions(['profile:read', 'profile:write'])).toBe(true);
  });

  it('returns the configured permission-denied UrlTree when a required permission is absent', () => {
    const parseUrl = vi.fn((url: string) => `URL:${url}`);
    const injector = Injector.create({
      providers: [
        {
          provide: StynxSessionService,
          useValue: {
            hasAllPermissions: vi.fn((permissions: string[]) => permissions.includes('profile:read')),
          },
        },
        { provide: Router, useValue: { parseUrl } },
        {
          provide: STYNX_ANGULAR_AUTH_OPTIONS,
          useValue: authOptions({ permissionDeniedPath: '/identity/denied' }),
        },
      ],
    });

    const allow = runInInjectionContext(
      injector,
      () => stynxPermissionGuard('profile:read')({} as never, {} as never),
    );
    const deny = runInInjectionContext(
      injector,
      () => stynxPermissionGuard('profile:erase')({} as never, {} as never),
    );

    expect(allow).toBe(true);
    expect(deny).toBe('URL:/identity/denied');
    expect(parseUrl).toHaveBeenCalledWith('/identity/denied');
  });
});
