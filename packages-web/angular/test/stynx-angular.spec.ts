import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError, firstValueFrom, type Observable } from 'rxjs';
import { AuthInterceptor } from '../src/auth.interceptor';
import { ErrorBannerService } from '../src/error-banner.service';
import { ErrorInterceptor } from '../src/error.interceptor';
import { generateClientRequestId } from '../src/request-id';
import { RequestIdInterceptor } from '../src/request-id.interceptor';
import { EmptyStateComponent } from '../src/empty-state.component';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';
import { ToastService } from '../src/toast.service';
import { ForbiddenError } from '@stynx-web/sdk';

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

describe('@stynx-web/angular', () => {
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
    const tenantContext = new TenantContextService(
      {},
      null,
    );
    tenantContext.setTenant('tenant-a', 'manual');
    const tenant = new TenantInterceptor(tenantContext);
    const auth = new AuthInterceptor(
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

  it('passes auth through when bearer mode is disabled and reports auth failure when refresh is empty', async () => {
    let authFailures = 0;
    const passthrough = new AuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'cookie' },
      {
        getAccessToken: async () => 'token',
        refresh: async () => 'fresh',
      },
    );
    const passthroughHandler = new FakeHandler([of({ ok: true }) as Observable<unknown>]);

    await expect(firstValueFrom(passthrough.intercept(new FakeRequest() as never, passthroughHandler as never))).resolves.toEqual({ ok: true });
    expect(passthroughHandler.seen[0]?.headers.get('authorization')).toBeNull();

    const auth = new AuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      {
        getAccessToken: async () => 'expired-token',
        refresh: async () => null,
        onAuthFailure: async () => {
          authFailures += 1;
        },
      },
    );
    const error = new HttpErrorResponse({ status: 401, error: { code: 'AUTHENTICATION_ERROR' } });
    const handler = new FakeHandler([throwError(() => error)]);

    await expect(firstValueFrom(auth.intercept(new FakeRequest() as never, handler as never))).rejects.toBe(error);
    expect(authFailures).toBe(1);
  });

  it('skips auth without a provider and does not retry non-retryable errors', async () => {
    const noProvider = new AuthInterceptor(
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
      null,
    );
    const noProviderHandler = new FakeHandler([of({ ok: true }) as Observable<unknown>]);
    await expect(firstValueFrom(noProvider.intercept(new FakeRequest() as never, noProviderHandler as never))).resolves.toEqual({ ok: true });
    expect(noProviderHandler.seen[0]?.headers.get('authorization')).toBeNull();

    const auth = new AuthInterceptor(
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

  it('leaves bearer requests unchanged when the provider has no token', async () => {
    const auth = new AuthInterceptor(
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
    expect(handler.seen[0]?.headers.get('authorization')).toBeNull();
  });

  it('maps server errors through ErrorBannerService', async () => {
    const banners = new ErrorBannerService();
    const interceptor = new ErrorInterceptor(banners);
    const handler = new FakeHandler([
      throwError(() => new HttpErrorResponse({
        status: 403,
        error: { code: 'TENANT_ACCESS_DENIED', message: 'forbidden' },
      })),
    ]);

    const request = interceptor.intercept(new FakeRequest() as never, handler as never);

    await expect(firstValueFrom(request)).rejects.toBeInstanceOf(ForbiddenError);
    expect(banners.current()?.code).toBe('TENANT_ACCESS_DENIED');
    expect(banners.current()?.message).toBe('forbidden');
    banners.clear();
    expect(banners.current()).toBeNull();
  });

  it('maps HTTP error context and omits falsy status from banners', async () => {
    const banners = new ErrorBannerService();
    const interceptor = new ErrorInterceptor(banners);

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
    const banners = new ErrorBannerService();
    const interceptor = new ErrorInterceptor(banners);
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
    const banners = new ErrorBannerService();
    const interceptor = new ErrorInterceptor(banners);
    const error = new Error('plain failure');

    await expect(firstValueFrom(interceptor.intercept(
      new FakeRequest() as never,
      new FakeHandler([throwError(() => error)]) as never,
    ))).rejects.toBe(error);

    expect(banners.current()).toBeNull();
  });

  it('resolves tenant context from query, subdomain, then default resolver', async () => {
    const tenantContext = new TenantContextService(
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
    const service = new ToastService();
    const snapshots: unknown[] = [];
    const subscription = service.messages$.subscribe((messages) => snapshots.push(messages));

    const id = service.push({ title: 'Saved', description: 'Document saved', tone: 'success' });
    expect(id).toBe('toast-1700000000000-8');
    expect(service.messages()).toEqual([
      { id, title: 'Saved', description: 'Document saved', tone: 'success' },
    ]);

    service.remove('missing');
    expect(service.messages()).toHaveLength(1);
    service.remove(id);
    expect(service.messages()).toEqual([]);
    service.push({ title: 'Warning', description: 'Check input', tone: 'warning' });
    service.clear();
    expect(service.messages()).toEqual([]);
    expect(snapshots.at(-1)).toEqual([]);
    subscription.unsubscribe();
  });

  it('keeps empty-state component inputs as configured', () => {
    const component = new EmptyStateComponent();
    expect(component.tone).toBe('info');
    component.title = 'No records';
    component.description = 'Create a record to continue';
    component.tone = 'warning';
    expect(component).toMatchObject({
      title: 'No records',
      description: 'Create a record to continue',
      tone: 'warning',
    });
  });
});
