import '@angular/compiler';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { HttpErrorResponse } from '@angular/common/http';
import { ApplicationRef, Injector, NgZone, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of, throwError, firstValueFrom, type Observable } from 'rxjs';
import { AuthInterceptor } from '../src/auth.interceptor';
import { ErrorBannerService } from '../src/error-banner.service';
import { ErrorInterceptor } from '../src/error.interceptor';
import { provideStynxDefaults } from '../src/provide-defaults';
import { generateClientRequestId } from '../src/request-id';
import { RequestIdInterceptor } from '../src/request-id.interceptor';
import { StynxAngularModule } from '../src/stynx-angular.module';
import { EmptyStateComponent } from '../src/empty-state.component';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';
import { ToastService } from '../src/toast.service';
import { ForbiddenError, UnauthorizedError } from '@stynx-web/sdk';
import { STYNX_ANGULAR_OPTIONS, STYNX_AUTH_PROVIDER, STYNX_WINDOW } from '../src/tokens';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW, type TenancyOptions } from '@stynx-web/angular-tenancy';
import { renderComponent } from './support/test-bed';

const REQUEST_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class FakeHeaders {
  private readonly values = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    if (!seed) {
      return;
    }
    for (const [key, value] of Object.entries(seed)) {
      this.values.set(key.toLowerCase(), value);
    }
  }

  has(name: string): boolean {
    return this.values.has(name.toLowerCase());
  }

  get(name: string): string | null {
    return this.values.get(name.toLowerCase()) ?? null;
  }

  toObject(): Record<string, string> {
    return Object.fromEntries(this.values.entries());
  }
}

class FakeRequest {
  constructor(readonly headers = new FakeHeaders()) {}

  clone(options: { setHeaders?: Record<string, string> }): FakeRequest {
    return new FakeRequest(
      new FakeHeaders({
        ...this.headers.toObject(),
        ...(options.setHeaders ?? {}),
      }),
    );
  }
}

class FakeHandler {
  readonly seen: FakeRequest[] = [];

  constructor(private readonly responses: Array<Observable<unknown>>) {}

  handle(request: FakeRequest) {
    this.seen.push(request);
    const response = this.responses.shift();
    if (!response) {
      throw new Error('No fake response configured');
    }
    return response;
  }
}

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

function createTenantInterceptor(tenantContext: TenantContextService): TenantInterceptor {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [{ provide: TenantContextService, useValue: tenantContext }],
  });
  return runInInjectionContext(injector, () => new TenantInterceptor());
}

function createAuthInterceptor(
  options: { apiBaseUrl: string; sessionMode: 'bearer' | 'cookie' },
  authProvider: unknown,
  errorBanner?: ErrorBannerService,
  providers: Parameters<typeof Injector.create>[0]['providers'] = [],
): AuthInterceptor {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [
      { provide: STYNX_ANGULAR_OPTIONS, useValue: options },
      { provide: STYNX_AUTH_PROVIDER, useValue: authProvider },
      ...(errorBanner ? [{ provide: ErrorBannerService, useValue: errorBanner }] : []),
      ...providers,
    ],
  });
  return runInInjectionContext(injector, () => new AuthInterceptor());
}

function createErrorInterceptor(errorBanner: ErrorBannerService): ErrorInterceptor {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [{ provide: ErrorBannerService, useValue: errorBanner }],
  });
  return runInInjectionContext(injector, () => new ErrorInterceptor());
}

function createErrorBannerService(tenantContext?: TenantContextService): ErrorBannerService {
  if (!tenantContext) {
    return TestBed.runInInjectionContext(() => new ErrorBannerService());
  }

  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [{ provide: TenantContextService, useValue: tenantContext }],
  });
  return runInInjectionContext(injector, () => new ErrorBannerService());
}

function createToastService(): ToastService {
  return TestBed.runInInjectionContext(() => new ToastService());
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular', () => {
  it('renders the empty-state component with input-driven copy and tone', async () => {
    const fixture = await renderComponent(EmptyStateComponent, {
      inputs: {
        title: 'No records',
        description: 'Create a record to start.',
        tone: 'warning',
      },
    });

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('section')?.getAttribute('data-tone')).toBe('warning');
    expect(host.textContent).toContain('No records');
    expect(host.textContent).toContain('Create a record to start.');
  });

  it('generates UUIDv7-shaped request ids for API headers', () => {
    expect(generateClientRequestId()).toMatch(REQUEST_ID_PATTERN);
  });

  it('falls back to Math.random when web crypto is unavailable', () => {
    const originalCrypto = globalThis.crypto;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    try {
      expect(generateClientRequestId()).toMatch(REQUEST_ID_PATTERN);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
      random.mockRestore();
      now.mockRestore();
    }
  });

  it('generates deterministic UUIDv7 bytes from fallback entropy and timestamp', () => {
    const originalCrypto = globalThis.crypto;
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    try {
      expect(generateClientRequestId()).toBe('018bcfe5-6800-7080-8080-808080808080');
      expect(random).toHaveBeenCalledTimes(16);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
      random.mockRestore();
      now.mockRestore();
    }
  });

  it('generates deterministic UUIDv7 bytes from web crypto entropy and timestamp', () => {
    const originalCrypto = globalThis.crypto;
    const random = vi.spyOn(Math, 'random');
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index;
      }
      return bytes;
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: { getRandomValues },
    });

    try {
      expect(generateClientRequestId()).toBe('018bcfe5-6800-7607-8809-0a0b0c0d0e0f');
      expect(getRandomValues).toHaveBeenCalledWith(expect.any(Uint8Array));
      expect(random).not.toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        configurable: true,
        value: originalCrypto,
      });
      random.mockRestore();
      now.mockRestore();
    }
  });

  it('preserves caller request ids', async () => {
    const requestId = new RequestIdInterceptor();
    const handler = new FakeHandler([of({ ok: true }) as Observable<unknown>]);

    await expect(firstValueFrom(requestId.intercept(
      new FakeRequest(new FakeHeaders({ 'X-Request-Id': 'caller-id' })) as never,
      handler as never,
    ))).resolves.toEqual({ ok: true });

    expect(handler.seen[0]?.headers.get('x-request-id')).toBe('caller-id');
  });

  it('applies request-id, tenant, and auth headers and refreshes after 401', async () => {
    let token = 'expired-token';
    let getAccessTokenCalls = 0;
    let refreshCalls = 0;
    const authProvider = {
      getAccessToken: async () => {
        getAccessTokenCalls += 1;
        return token;
      },
      refresh: async () => {
        refreshCalls += 1;
        token = 'fresh-token';
        return token;
      },
    };

    const requestId = new RequestIdInterceptor();
    const tenantContext = createTenantContext(
      {},
      null,
    );
    tenantContext.setTenant('tenant-a', 'manual');
    const tenant = createTenantInterceptor(tenantContext);
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      authProvider,
    );
    const handler = new FakeHandler([
      throwError(() => new HttpErrorResponse({ status: 401, error: { code: 'AUTHENTICATION_ERROR', message: 'expired' } })),
      of({ ok: true }) as Observable<unknown>,
    ]);

    const request = requestId.intercept(new FakeRequest() as never, {
      handle: (current: unknown) => tenant.intercept(current as never, {
        handle: (nextRequest: unknown) => auth.intercept(nextRequest as never, handler as never),
      } as never),
    } as never);

    await expect(firstValueFrom(request)).resolves.toEqual({ ok: true });
    expect(handler.seen[0]?.headers.get('x-request-id')).toMatch(REQUEST_ID_PATTERN);
    expect(handler.seen[0]?.headers.get('x-tenant-id')).toBe('tenant-a');
    expect(handler.seen[0]?.headers.get('authorization')).toBe('Bearer expired-token');
    expect(handler.seen[1]?.headers.get('authorization')).toBe('Bearer fresh-token');
    expect(handler.seen[1]?.headers.get('x-stynx-auth-retried')).toBe('true');
    expect(getAccessTokenCalls).toBe(1);
    expect(refreshCalls).toBe(1);
  });

  it('refreshes after a mapped unauthorized SDK error', async () => {
    let token = 'expired-token';
    let refreshCalls = 0;
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => token,
        refresh: async () => {
          refreshCalls += 1;
          token = 'fresh-token';
          return token;
        },
      },
    );
    const handler = new FakeHandler([
      throwError(() => new UnauthorizedError('expired', 401, 'AUTHENTICATION_ERROR')),
      of({ ok: true }) as Observable<unknown>,
    ]);

    await expect(firstValueFrom(auth.intercept(new FakeRequest() as never, handler as never))).resolves.toEqual({ ok: true });
    expect(handler.seen[0]?.headers.get('authorization')).toBe('Bearer expired-token');
    expect(handler.seen[1]?.headers.get('authorization')).toBe('Bearer fresh-token');
    expect(handler.seen[1]?.headers.get('x-stynx-auth-retried')).toBe('true');
    expect(refreshCalls).toBe(1);
  });

  it('passes auth through when bearer mode is disabled and shows a re-login action when refresh is empty', async () => {
    let authFailures = 0;
    let loginRedirects = 0;
    const passthrough = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'cookie' },
      {
        getAccessToken: async () => 'token',
        refresh: async () => 'fresh',
      },
    );
    const passthroughHandler = new FakeHandler([of({ ok: true }) as Observable<unknown>]);

    await expect(firstValueFrom(passthrough.intercept(new FakeRequest() as never, passthroughHandler as never))).resolves.toEqual({ ok: true });
    expect(passthroughHandler.seen[0]?.headers.get('authorization')).toBe(null);

    const error = new HttpErrorResponse({ status: 401, error: { code: 'AUTHENTICATION_ERROR' } });
    const handler = new FakeHandler([throwError(() => error)]);
    const banners = createErrorBannerService();

    const reloginAuth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => 'expired-token',
        refresh: async () => null,
        loginRedirect: () => {
          loginRedirects += 1;
        },
        onAuthFailure: async () => {
          authFailures += 1;
        },
      },
      banners,
    );

    await expect(firstValueFrom(reloginAuth.intercept(new FakeRequest() as never, handler as never))).rejects.toBe(error);
    expect(authFailures).toBe(1);
    expect(banners.current()).toMatchObject({
      message: 'Your session expired. Please log in again.',
      tone: 'error',
      actionLabel: 'log in',
    });
    await banners.current()?.action?.();
    expect(loginRedirects).toBe(1);
  });

  it('skips auth without a provider and does not retry non-retryable errors', async () => {
    const noProvider = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      null,
    );
    const noProviderHandler = new FakeHandler([of({ ok: true }) as Observable<unknown>]);
    await expect(firstValueFrom(noProvider.intercept(new FakeRequest() as never, noProviderHandler as never))).resolves.toEqual({ ok: true });
    expect(noProviderHandler.seen[0]?.headers.get('authorization')).toBe(null);

    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => 'token',
        refresh: async () => {
          throw new Error('refresh should not run');
        },
      },
    );
    const retried = new FakeRequest(new FakeHeaders({ 'x-stynx-auth-retried': 'true' }));
    const retriedError = new HttpErrorResponse({ status: 401, error: { message: 'still expired' } });
    await expect(firstValueFrom(auth.intercept(
      retried as never,
      new FakeHandler([throwError(() => retriedError)]) as never,
    ))).rejects.toBe(retriedError);

    const plainError = new Error('plain');
    await expect(firstValueFrom(auth.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => plainError)]) as never,
    ))).rejects.toBe(plainError);
  });

  it('does not treat malformed bearer-looking authorization headers as retryable attempts', async () => {
    let refreshCalls = 0;
    const error = new HttpErrorResponse({ status: 401, error: { message: 'login failed' } });
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => null,
        refresh: async () => {
          refreshCalls += 1;
          return 'fresh-token';
        },
      },
    );

    await expect(firstValueFrom(auth.intercept(
      new FakeRequest(new FakeHeaders({ Authorization: 'Token Bearer stale-token' })) as never,
      new FakeHandler([throwError(() => error)]) as never,
    ))).rejects.toBe(error);

    await expect(firstValueFrom(auth.intercept(
      new FakeRequest(new FakeHeaders({ Authorization: 'Bearerstale-token' })) as never,
      new FakeHandler([throwError(() => error)]) as never,
    ))).rejects.toBe(error);

    expect(refreshCalls).toBe(0);
  });

  it('rethrows errors inside the injected zone and ticks non-destroyed apps after delivery', async () => {
    vi.useFakeTimers();
    const run = vi.fn((callback: () => void) => callback());
    const tick = vi.fn();
    const error = new Error('zone failure');
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => null,
        refresh: async () => {
          throw new Error('refresh should not run');
        },
      },
      undefined,
      [
        { provide: NgZone, useValue: { run } },
        { provide: ApplicationRef, useValue: { destroyed: false, tick } },
      ],
    );

    await expect(firstValueFrom(auth.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => error)]) as never,
    ))).rejects.toBe(error);

    expect(run).toHaveBeenCalledWith(expect.any(Function));
    expect(tick).not.toHaveBeenCalledTimes(1);
    vi.runOnlyPendingTimers();
    expect(tick).toHaveBeenCalledWith();
    vi.useRealTimers();
  });

  it('skips the post-error tick when the injected app ref is already destroyed', async () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const error = new Error('destroyed app');
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => null,
        refresh: async () => {
          throw new Error('refresh should not run');
        },
      },
      undefined,
      [{ provide: ApplicationRef, useValue: { destroyed: true, tick } }],
    );

    await expect(firstValueFrom(auth.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => error)]) as never,
    ))).rejects.toBe(error);

    vi.runOnlyPendingTimers();
    expect(tick).not.toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('leaves bearer requests unchanged when the provider has no token', async () => {
    const unauthorized = new HttpErrorResponse({ status: 401, error: { message: 'login failed' } });
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => null,
        refresh: async () => {
          throw new Error('refresh should not run');
        },
      },
    );
    const handler = new FakeHandler([of({ ok: true }) as Observable<unknown>]);

    await expect(firstValueFrom(auth.intercept(new FakeRequest() as never, handler as never))).resolves.toEqual({ ok: true });
    expect(handler.seen[0]?.headers.get('authorization')).toBe(null);

    await expect(firstValueFrom(auth.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => unauthorized)]) as never,
    ))).rejects.toBe(unauthorized);
  });

  it('passes unauthenticated mapped 401 errors through without refresh', async () => {
    let refreshCalls = 0;
    const auth = createAuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => null,
        refresh: async () => {
          refreshCalls += 1;
          return 'fresh-token';
        },
      },
    );
    const banners = createErrorBannerService();
    const error = new HttpErrorResponse({
      status: 401,
      error: { code: 'AUTHENTICATION_ERROR', message: 'login failed' },
    });
    const handler = new FakeHandler([throwError(() => error)]);

    await expect(firstValueFrom(auth.intercept(new FakeRequest() as never, {
      handle: (request: unknown) => createErrorInterceptor(banners).intercept(request as never, handler as never),
    } as never))).rejects.toBeInstanceOf(UnauthorizedError);

    expect(handler.seen).toHaveLength(1);
    expect(handler.seen[0]?.headers.get('authorization')).toBe(null);
    expect(refreshCalls).toBe(0);
    expect(banners.current()).toMatchObject({
      message: 'login failed',
      code: 'AUTHENTICATION_ERROR',
      status: 401,
    });
  });

  it('maps server errors through ErrorBannerService', async () => {
    const tenantContext = createTenantContext({}, null);
    tenantContext.setAvailableTenants([{ id: 'tenant-a', label: 'Tenant A' }]);
    tenantContext.setTenant('tenant-a', 'manual');
    const banners = createErrorBannerService(tenantContext);
    const interceptor = createErrorInterceptor(banners);
    const handler = new FakeHandler([
      throwError(() => new HttpErrorResponse({
        status: 403,
        error: { code: 'TENANT_ACCESS_DENIED', message: 'forbidden' },
      })),
    ]);

    const request = interceptor.intercept(new FakeRequest() as never, handler as never);

    await expect(firstValueFrom(request)).rejects.toBeInstanceOf(ForbiddenError);
    expect(banners.current()?.code).toBe('TENANT_ACCESS_DENIED');
    expect(banners.current()?.message).toBe('[Tenant A] forbidden');
    expect(banners.current()?.context).toEqual({ tenantLabel: 'Tenant A' });
    banners.clear();
    expect(banners.current()).toBe(null);
  });

  it('maps HTTP error context and omits falsy status from banners', async () => {
    const banners = createErrorBannerService();
    const interceptor = createErrorInterceptor(banners);

    await expect(firstValueFrom(interceptor.intercept(
      new FakeRequest() as never,
      new FakeHandler([
        throwError(() => new HttpErrorResponse({
          status: 422,
          error: {
            code: 'STORAGE_VALIDATION_ERROR',
            message: 'invalid file',
            context: { field: 'mimeType' },
          },
        })),
      ]) as never,
    ))).rejects.toThrow('invalid file');
    expect(banners.current()).toEqual({
      message: 'invalid file',
      code: 'STORAGE_VALIDATION_ERROR',
      status: 422,
      context: { field: 'mimeType' },
    });

    await expect(firstValueFrom(interceptor.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => new HttpErrorResponse({ status: 0, error: {} }))]) as never,
    ))).rejects.toThrow('Request failed with status 0');
    expect(banners.current()).toEqual({
      message: 'Request failed with status 0',
    });
  });

  it('maps HTTP errors without optional code, status, or context fields', async () => {
    const banners = createErrorBannerService();
    const interceptor = createErrorInterceptor(banners);
    const handler = new FakeHandler([
      throwError(() => new HttpErrorResponse({
        status: 500,
        error: 'server exploded',
      })),
    ]);

    await expect(firstValueFrom(interceptor.intercept(new FakeRequest() as never, handler as never))).rejects.toThrow('Request failed with status 500');
    expect(banners.current()).toEqual({
      message: 'Request failed with status 500',
      status: 500,
    });
  });

  it('passes non-HTTP errors through without showing a banner', async () => {
    const banners = createErrorBannerService();
    const interceptor = createErrorInterceptor(banners);
    const error = new Error('plain failure');

    await expect(firstValueFrom(interceptor.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => error)]) as never,
    ))).rejects.toBe(error);

    expect(banners.current()).toBe(null);
  });

  it('resolves tenant context from query, subdomain, then default resolver', async () => {
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async () => 'fallback-tenant',
      },
      {
        location: {
          href: 'https://app.example.test/dashboard?tenantId=query-tenant',
          host: 'app.example.test',
        },
      } as never,
    );

    await tenantContext.initialize();
    expect(tenantContext.activeTenant()).toEqual({ id: 'query-tenant', source: 'query' });

    await tenantContext.initialize({
      url: 'https://tenant-b.example.test/dashboard',
      host: 'tenant-b.example.test',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-b', source: 'subdomain' });

    await tenantContext.initialize({
      url: 'https://localhost/dashboard',
      host: 'localhost',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'fallback-tenant', source: 'default' });

    await tenantContext.initialize({
      url: 'http://127.0.0.1:3100/records/new',
      host: '127.0.0.1:3100',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'fallback-tenant', source: 'default' });
  });

  it('tracks toast service signal and observable lifecycles', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const service = createToastService();
    const snapshots: unknown[] = [];
    const subscription = service.messages$.subscribe((messages) => snapshots.push(messages));

    const id = service.push({ kind: 'success', message: 'Document saved' });
    expect(id).toBe('toast-1700000000000-8');
    expect(service.messages()).toEqual([
      { id, kind: 'success', message: 'Document saved' },
    ]);

    service.remove('missing');
    expect(service.messages()).toHaveLength(1);
    service.remove(id);
    expect(service.messages()).toEqual([]);
    service.push({ kind: 'warning', message: 'Check input' });
    service.clear();
    expect(service.messages()).toEqual([]);
    expect(snapshots.at(-1)).toEqual([]);
    subscription.unsubscribe();
  });

  it('keeps empty-state component inputs as configured', () => {
    const component = new EmptyStateComponent();
    expect(component.tone).toBe('info');
    expect(component.title).toBe('');
    expect(component.description).toBe('');
    component.title = 'No records';
    component.description = 'Create a record to continue';
    component.tone = 'warning';
    expect(component).toMatchObject({
      title: 'No records',
      description: 'Create a record to continue',
      tone: 'warning',
    });
  });

  it('provides standalone stynx defaults with feature-provider overrides', () => {
    const authProvider = {
      getAccessToken: async () => 'feature-token',
      refresh: async () => 'feature-token',
    };
    const defaultTenantResolver = () => 'tenant-from-angular';
    const tenancyResolver = () => 'tenant-from-tenancy';

    TestBed.configureTestingModule({
      providers: [
        provideStynxDefaults({
          angular: {
            apiBaseUrl: '/api',
            sessionMode: 'bearer',
            defaultTenantResolver,
          },
          tenancy: {
            defaultTenantResolver: tenancyResolver,
          },
          auth: {
            provide: STYNX_AUTH_PROVIDER,
            useValue: authProvider,
          },
        }),
      ],
    });

    expect(TestBed.inject(STYNX_ANGULAR_OPTIONS)).toMatchObject({
      apiBaseUrl: '/api',
      sessionMode: 'bearer',
    });
    expect(TestBed.inject(STYNX_AUTH_PROVIDER)).toBe(authProvider);
    expect(TestBed.inject(STYNX_WINDOW)).toBe(window);
    expect(TestBed.inject(STYNX_TENANCY_OPTIONS).defaultTenantResolver).toBe(tenancyResolver);
    expect(TestBed.inject(STYNX_TENANCY_WINDOW)).toBe(window);

    const interceptors = TestBed.inject(HTTP_INTERCEPTORS);
    expect(interceptors.some((interceptor) => interceptor instanceof RequestIdInterceptor)).toBe(true);
    expect(interceptors.some((interceptor) => interceptor instanceof AuthInterceptor)).toBe(true);
    expect(interceptors.some((interceptor) => interceptor instanceof ErrorInterceptor)).toBe(true);
  });

  it('registers module error mapping outside auth refresh handling', () => {
    TestBed.configureTestingModule({
      imports: [
        StynxAngularModule.forRoot({
          apiBaseUrl: '/api',
          sessionMode: 'bearer',
          authProvider: {
            getAccessToken: async () => null,
            refresh: async () => null,
          },
        }),
      ],
    });

    const interceptors = TestBed.inject(HTTP_INTERCEPTORS);
    const authIndex = interceptors.findIndex((interceptor) => interceptor instanceof AuthInterceptor);
    const errorIndex = interceptors.findIndex((interceptor) => interceptor instanceof ErrorInterceptor);
    expect(errorIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeGreaterThan(errorIndex);
  });
});
