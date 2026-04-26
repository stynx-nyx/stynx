import '@angular/compiler';
import { HttpErrorResponse } from '@angular/common/http';
import { of, throwError, firstValueFrom, type Observable } from 'rxjs';
import { AuthInterceptor } from '../src/auth.interceptor';
import { ErrorBannerService } from '../src/error-banner.service';
import { ErrorInterceptor } from '../src/error.interceptor';
import { generateClientRequestId } from '../src/request-id';
import { RequestIdInterceptor } from '../src/request-id.interceptor';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';
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
      { apiBaseUrl: '/api', sessionMode: 'bearer' },
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
  });

  it('resolves tenant context from query, subdomain, then default resolver', async () => {
    const tenantContext = new TenantContextService(
      {
        apiBaseUrl: '/api',
        sessionMode: 'cookie',
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
});