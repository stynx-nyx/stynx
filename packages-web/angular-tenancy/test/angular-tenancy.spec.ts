import '@angular/compiler';
import { APP_INITIALIZER, Injector, runInInjectionContext, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { of, firstValueFrom, type Observable } from 'rxjs';
import { provideTenancy } from '../src/provide-tenancy';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';
import { TenantSwitcherComponent } from '../src/tenant-switcher.component';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from '../src/tokens';
import type { TenancyOptions } from '../src/types';

class FakeHeaders {
  private readonly values = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    for (const [key, value] of Object.entries(seed ?? {})) {
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
    return new FakeRequest(new FakeHeaders({ ...this.headers.toObject(), ...(options.setHeaders ?? {}) }));
  }
}

class FakeHandler {
  readonly seen: FakeRequest[] = [];

  handle(request: FakeRequest): Observable<{ ok: true }> {
    this.seen.push(request);
    return of({ ok: true });
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

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-web/angular-tenancy', () => {
  it('provides tenancy options, browser window fallback, initializer, and interceptor providers', async () => {
    const options = { defaultTenantResolver: async () => 'tenant-default' };
    const providers = provideTenancy(options) as Array<Provider | Record<string, unknown>>;
    const optionProvider = providers.find((provider) =>
      typeof provider === 'object' && provider !== null && provider['provide'] === STYNX_TENANCY_OPTIONS,
    ) as Record<string, unknown>;
    const windowProvider = providers.find((provider) =>
      typeof provider === 'object' && provider !== null && provider['provide'] === STYNX_TENANCY_WINDOW,
    ) as Record<string, () => Window | null>;
    const initializerProvider = providers.find((provider) =>
      typeof provider === 'object' && provider !== null && provider['provide'] === APP_INITIALIZER,
    ) as Record<string, unknown>;
    const interceptorProvider = providers.find((provider) =>
      typeof provider === 'object' && provider !== null && provider['provide'] === HTTP_INTERCEPTORS,
    ) as Record<string, unknown>;
    const service = { initialize: vi.fn().mockResolvedValue(undefined) };

    expect(providers).toContain(TenantContextService);
    expect(optionProvider['useValue']).toBe(options);
    expect(windowProvider['useFactory']()).toBe(window);
    expect((initializerProvider['deps'] as unknown[])).toEqual([TenantContextService]);
    expect(initializerProvider['multi']).toBe(true);
    await expect((initializerProvider['useFactory'] as (input: typeof service) => () => Promise<void>)(service)()).resolves.toBeUndefined();
    expect(service.initialize).toHaveBeenCalledTimes(1);
    expect(interceptorProvider['useClass']).toBe(TenantInterceptor);
    expect(interceptorProvider['multi']).toBe(true);
  });

  it('provides default tenancy options', () => {
    const providers = provideTenancy() as Array<Provider | Record<string, unknown>>;
    const optionProvider = providers.find((provider) =>
      typeof provider === 'object' && provider !== null && provider['provide'] === STYNX_TENANCY_OPTIONS,
    ) as Record<string, unknown>;

    expect(optionProvider['useValue']).toEqual({});
  });

  it('initializes tenants from query, subdomain, default resolver, and clear', async () => {
    const emitted: Array<string | null> = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ host }) => host === 'localhost' ? 'fallback-tenant' : null,
      },
      null,
    );
    tenantContext.currentTenantId$.subscribe((tenantId) => emitted.push(tenantId));

    await tenantContext.initialize({
      url: '/dashboard?tenant=tenant-query',
      host: 'app.example.test',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-query', source: 'query' });

    await tenantContext.initialize({
      url: 'https://tenant-sub.example.test/home',
      host: 'tenant-sub.example.test',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-sub', source: 'subdomain' });

    await tenantContext.initialize({
      url: 'https://localhost/home',
      host: 'localhost',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'fallback-tenant', source: 'default' });

    tenantContext.clear();
    expect(tenantContext.activeTenant()).toBeNull();
    expect(emitted).toContain(null);
  });

  it('normalizes URL and host edge cases before using the default resolver', async () => {
    const seen: Array<{ url: string; host: string }> = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ url, host }) => {
          seen.push({ url: url.href, host });
          return 'fallback-tenant';
        },
      },
      {
        location: {
          href: '/from-window?x=1',
          host: '127.0.0.1:4200',
        },
      } as Window,
    );

    await tenantContext.initialize();
    expect(tenantContext.activeTenant()).toEqual({ id: 'fallback-tenant', source: 'default' });
    expect(seen[0]).toEqual({
      url: 'https://127.0.0.1:4200/from-window?x=1',
      host: '127.0.0.1:4200',
    });

    tenantContext.clear();
    await tenantContext.initialize({
      url: '/portal',
      host: 'tenant.localhost',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'fallback-tenant', source: 'default' });

    tenantContext.clear();
    await tenantContext.initialize({
      url: 'https://[::1]/portal',
      host: '[::1]',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'fallback-tenant', source: 'default' });
  });

  it('leaves tenant unset when no source resolves and supports manual source default', async () => {
    const tenantContext = createTenantContext({}, null);

    await tenantContext.initialize();
    expect(tenantContext.activeTenant()).toBeNull();

    await tenantContext.initialize({
      url: '/dashboard',
      host: '',
    });
    expect(tenantContext.activeTenant()).toBeNull();

    tenantContext.setTenant('tenant-manual');
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-manual', source: 'manual' });
  });

  it('adds X-Tenant-Id from the current tenant context', async () => {
    const tenantContext = createTenantContext({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const interceptor = new TenantInterceptor(tenantContext);
    const handler = new FakeHandler();

    await expect(firstValueFrom(interceptor.intercept(new FakeRequest() as never, handler as never))).resolves.toEqual({
      ok: true,
    });

    expect(handler.seen[0]?.headers.get('x-tenant-id')).toBe('tenant-a');
  });

  it('does not override an existing tenant header', async () => {
    const tenantContext = createTenantContext({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const interceptor = new TenantInterceptor(tenantContext);
    const handler = new FakeHandler();

    await firstValueFrom(interceptor.intercept(
      new FakeRequest(new FakeHeaders({ 'x-tenant-id': 'tenant-existing' })) as never,
      handler as never,
    ));

    expect(handler.seen[0]?.headers.get('x-tenant-id')).toBe('tenant-existing');
  });

  it('tenant switcher ignores empty selections and emits manual tenant changes', () => {
    const component = Object.create(TenantSwitcherComponent.prototype) as TenantSwitcherComponent;
    const tenantContext = { setTenant: vi.fn() };
    const tenantChange = { emit: vi.fn() };
    Object.defineProperty(component, 'tenantContext', { value: tenantContext });
    Object.defineProperty(component, 'tenantChange', { value: tenantChange });

    component.selectTenant({ target: { value: '' } } as unknown as Event);
    expect(tenantContext.setTenant).not.toHaveBeenCalled();
    expect(tenantChange.emit).not.toHaveBeenCalled();

    component.selectTenant({ target: { value: 'tenant-b' } } as unknown as Event);
    expect(tenantContext.setTenant).toHaveBeenCalledWith('tenant-b', 'manual');
    expect(tenantChange.emit).toHaveBeenCalledWith('tenant-b');
  });

  it('constructs the tenant switcher in an injection context', () => {
    const tenantContext = { tenantId: () => null, setTenant: vi.fn() };
    const injector = Injector.create({
      providers: [
        { provide: STYNX_TENANCY_OPTIONS, useValue: {} },
        { provide: STYNX_TENANCY_WINDOW, useValue: null },
        { provide: TenantContextService, useValue: tenantContext },
      ],
    });

    const component = runInInjectionContext(injector, () => new TenantSwitcherComponent());

    expect(component.tenants).toEqual([]);
    expect(component.tenantContext).toBe(tenantContext);
  });
});
