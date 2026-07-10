import '@angular/compiler';
import { APP_INITIALIZER, Injector, runInInjectionContext, signal, type Provider } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { StynxI18nService } from '@stynx-nyx/angular-i18n';
import { of, firstValueFrom, type Observable } from 'rxjs';
import { provideTenancy } from '../src/provide-tenancy';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';
import { StynxTenantPickerComponent } from '../src/tenant-picker.component';
import { TenantSwitcherComponent } from '../src/tenant-switcher.component';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from '../src/tokens';
import type { TenancyOptions, TenantTransition } from '../src/types';
import { renderComponent } from './support/test-bed';

type ProviderRecord = Provider & Record<string, unknown> & {
  provide: unknown;
};

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

function createTenantInterceptor(tenantContext: TenantContextService): TenantInterceptor {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [{ provide: TenantContextService, useValue: tenantContext }],
  });
  return runInInjectionContext(injector, () => new TenantInterceptor());
}

function isProviderRecord(provider: Provider): provider is ProviderRecord {
  return typeof provider === 'object' && provider !== null && !Array.isArray(provider) && 'provide' in provider;
}

function findProvider(providers: Provider[], token: unknown): ProviderRecord {
  const provider = providers.find((candidate): candidate is ProviderRecord =>
    isProviderRecord(candidate) && candidate.provide === token,
  );
  if (!provider) {
    throw new Error(`Expected provider for ${String(token)}`);
  }
  return provider;
}

function providerFactory<TArgs extends unknown[], TResult>(provider: ProviderRecord): (...args: TArgs) => TResult {
  expect(provider.useFactory).toEqual(expect.any(Function));
  return provider.useFactory as (...args: TArgs) => TResult;
}

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('@stynx-nyx/angular-tenancy', () => {
  it('renders the tenant switcher and emits selected tenants from the DOM', async () => {
    const tenantId = signal<string | null>(null);
    const tenantContext = {
      tenantId,
      setTenant: (id: string) => tenantId.set(id),
    } as unknown as TenantContextService;
    const seen: string[] = [];
    const fixture = await renderComponent(TenantSwitcherComponent, {
      inputs: {
        tenants: [
          { id: 'tenant-a', label: 'Tenant A' },
          { id: 'tenant-b', label: 'Tenant B' },
        ],
      },
      providers: [
        { provide: TenantContextService, useValue: tenantContext },
        {
          provide: StynxI18nService,
          useValue: {
            locale: () => 'en',
            translate: (key: string) => ({
              'tenancy.switcher.label': 'Tenant',
              'tenancy.switcher.placeholder': 'Choose tenant',
            })[key] ?? key,
          },
        },
      ],
    });
    fixture.componentInstance.tenantChange.subscribe((tenantId) => seen.push(tenantId));

    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector('select') as HTMLSelectElement;
    expect(host.textContent).toContain('Tenant A');
    select.value = 'tenant-b';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(tenantId()).toBe('tenant-b');
    expect(seen).toEqual(['tenant-b']);
  });

  it('provides tenancy options, browser window fallback, initializer, and interceptor providers', async () => {
    const options = { defaultTenantResolver: async () => 'tenant-default' };
    const providers = provideTenancy(options);
    const optionProvider = findProvider(providers, STYNX_TENANCY_OPTIONS);
    const windowProvider = findProvider(providers, STYNX_TENANCY_WINDOW);
    const initializerProvider = findProvider(providers, APP_INITIALIZER);
    const interceptorProvider = findProvider(providers, HTTP_INTERCEPTORS);
    const service = { initialize: vi.fn().mockResolvedValue(undefined) };

    expect(providers).toContain(TenantContextService);
    expect(optionProvider['useValue']).toBe(options);
    expect(providerFactory<[], Window | null>(windowProvider)()).toBe(window);
    expect((initializerProvider['deps'] as unknown[])).toEqual([TenantContextService]);
    expect(initializerProvider['multi']).toBe(true);
    await expect(providerFactory<[typeof service], () => Promise<void>>(initializerProvider)(service)()).resolves.toBe(undefined);
    expect(service.initialize).toHaveBeenCalledTimes(1);
    expect(interceptorProvider['useClass']).toBe(TenantInterceptor);
    expect(interceptorProvider['multi']).toBe(true);
  });

  it('provides default tenancy options', () => {
    const providers = provideTenancy();
    const optionProvider = findProvider(providers, STYNX_TENANCY_OPTIONS);

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
    expect(tenantContext.activeTenant()).toBe(null);
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

  it('prefers tenantId query values and strips ports before subdomain detection', async () => {
    const seen: Array<{ url: string; host: string }> = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ url, host }) => {
          seen.push({ url: url.href, host });
          return null;
        },
      },
      null,
    );

    await tenantContext.initialize({
      url: 'https://portal.example.test/work?tenantId=tenant-id&tenant=tenant-fallback',
      host: 'portal.example.test',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-id', source: 'query' });
    expect(seen).toEqual([]);

    tenantContext.clear();
    await tenantContext.initialize({
      url: '/home',
      host: 'ops.example.test:4200',
    });
    expect(tenantContext.activeTenant()).toEqual({ id: 'ops', source: 'subdomain' });
  });

  it('passes absolute https URLs to the fallback resolver without rewriting the host', async () => {
    const seen: Array<{ url: string; host: string }> = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ url, host }) => {
          seen.push({ url: url.href, host });
          return 'tenant-default';
        },
      },
      null,
    );

    await tenantContext.initialize({
      url: 'https://localhost/settings',
      host: 'localhost',
    });

    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-default', source: 'default' });
    expect(seen).toEqual([{ url: 'https://localhost/settings', host: 'localhost' }]);
  });

  it('normalizes http URLs, blank host fallbacks, and localhost-like hosts precisely', async () => {
    const seen: Array<{ url: string; host: string }> = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ url, host }) => {
          seen.push({ url: url.href, host });
          return null;
        },
      },
      null,
    );

    await tenantContext.initialize({
      url: 'http://localhost/settings',
      host: 'localhost',
    });
    await tenantContext.initialize({
      url: '/blank',
      host: '',
    });
    await tenantContext.initialize({
      url: '/localhost-label',
      host: 'localhost.example.test',
    });
    await tenantContext.initialize({
      url: '/ipv4-suffix',
      host: '10.20.30.40.example.test',
    });
    await tenantContext.initialize({
      url: '/with-port',
      host: 'tenant.example.test:4200',
    });

    expect(seen).toEqual([
      { url: 'http://localhost/settings', host: 'localhost' },
      { url: 'https://localhost/blank', host: '' },
      { url: 'https://localhost.example.test/localhost-label', host: 'localhost.example.test' },
    ]);
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant', source: 'subdomain' });
  });

  it('uses optional browser location fields defensively', async () => {
    const seen: Array<{ url: string; host: string }> = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ url, host }) => {
          seen.push({ url: url.href, host });
          return null;
        },
      },
      { location: {} } as Window,
    );

    await tenantContext.initialize();

    expect(seen).toEqual([{ url: 'https://localhost/', host: 'localhost' }]);
  });

  it('rejects IPv4 hosts and blank hosts before falling back to defaults', async () => {
    const seen: string[] = [];
    const tenantContext = createTenantContext(
      {
        defaultTenantResolver: async ({ host }) => {
          seen.push(host);
          return 'tenant-default';
        },
      },
      null,
    );

    await tenantContext.initialize({ url: '/x', host: '10.20.30.40:4200' });
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-default', source: 'default' });
    tenantContext.clear();
    await tenantContext.initialize({ host: '' });
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-default', source: 'default' });
    expect(seen).toEqual(['10.20.30.40:4200', '']);
  });

  it('leaves tenant unset when no source resolves and supports manual source default', async () => {
    const tenantContext = createTenantContext({}, null);

    await tenantContext.initialize();
    expect(tenantContext.activeTenant()).toBe(null);

    await tenantContext.initialize({
      url: '/dashboard',
      host: '',
    });
    expect(tenantContext.activeTenant()).toBe(null);

    tenantContext.setTenant('tenant-manual');
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-manual', source: 'manual' });
  });

  it('stores available tenants for first-load chooser surfaces', () => {
    const tenantContext = createTenantContext({}, null);
    expect(tenantContext.tenantLabel()).toBe(null);

    tenantContext.setAvailableTenants([
      { id: 'tenant-a', label: 'Tenant A' },
      { id: 'tenant-b', label: 'Tenant B', description: 'Operations workspace' },
    ]);
    tenantContext.setTenant('tenant-b', 'manual');

    expect(tenantContext.availableTenants()).toEqual([
      { id: 'tenant-a', label: 'Tenant A' },
      { id: 'tenant-b', label: 'Tenant B', description: 'Operations workspace' },
    ]);
    expect(tenantContext.tenantLabel()).toBe('Tenant B');

    tenantContext.setTenant('tenant-c', 'manual');
    expect(tenantContext.tenantLabel()).toBe('tenant-c');
  });

  it('emits tenantChanged$ only when the tenant id changes', () => {
    const emitted: TenantTransition[] = [];
    const tenantContext = createTenantContext({}, null);
    tenantContext.tenantChanged$.subscribe((transition) => emitted.push(transition));

    tenantContext.setTenant('tenant-a', 'manual');
    tenantContext.setTenant('tenant-a', 'query');
    expect(tenantContext.activeTenant()).toEqual({ id: 'tenant-a', source: 'query' });
    tenantContext.setTenant('tenant-b', 'manual');
    tenantContext.clear();
    tenantContext.clear();

    expect(emitted).toHaveLength(3);
    expect(emitted.map(({ from, to }) => ({ from, to }))).toEqual([
      { from: null, to: 'tenant-a' },
      { from: 'tenant-a', to: 'tenant-b' },
      { from: 'tenant-b', to: null },
    ]);
    expect(emitted.every(({ at }) => Number.isInteger(at) && at > 0)).toBe(true);
    expect(tenantContext.activeTenant()).toBe(null);
  });

  it('adds X-Tenant-Id from the current tenant context', async () => {
    const tenantContext = createTenantContext({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const interceptor = createTenantInterceptor(tenantContext);
    const handler = new FakeHandler();

    await expect(firstValueFrom(interceptor.intercept(new FakeRequest() as never, handler as never))).resolves.toEqual({
      ok: true,
    });

    expect(handler.seen[0]?.headers.get('x-tenant-id')).toBe('tenant-a');
  });

  it('does not override an existing tenant header', async () => {
    const tenantContext = createTenantContext({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const interceptor = createTenantInterceptor(tenantContext);
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
    expect(tenantContext.setTenant).not.toHaveBeenCalledTimes(1);
    expect(tenantChange.emit).not.toHaveBeenCalledTimes(1);

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

  it('tenant picker renders only on multi-tenant first load and projects content after selection', () => {
    TestBed.configureTestingModule({
      imports: [StynxTenantPickerComponent],
      providers: [
        TenantContextService,
        { provide: STYNX_TENANCY_OPTIONS, useValue: {} },
        { provide: STYNX_TENANCY_WINDOW, useValue: null },
      ],
    });
    const tenantContext = TestBed.inject(TenantContextService);
    tenantContext.setAvailableTenants([
      { id: 'tenant-a', label: 'Tenant A' },
      { id: 'tenant-b', label: 'Tenant B', description: 'Operations workspace' },
    ]);
    const fixture = TestBed.createComponent(StynxTenantPickerComponent);
    const emitted: string[] = [];
    fixture.componentInstance.tenantChange.subscribe((tenantId) => emitted.push(tenantId));

    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Choose a tenant');
    expect(fixture.nativeElement.textContent).toContain('Tenant A');
    expect(fixture.nativeElement.textContent).toContain('Operations workspace');

    const buttons = fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>;
    buttons[1]?.click();
    fixture.detectChanges();

    expect(tenantContext.tenantId()).toBe('tenant-b');
    expect(emitted).toEqual(['tenant-b']);
    expect(fixture.nativeElement.textContent).not.toContain('Choose a tenant');
  });

  it('tenant picker accepts explicit tenant options and stays passive for single tenants or active contexts', () => {
    TestBed.configureTestingModule({
      imports: [StynxTenantPickerComponent],
      providers: [
        TenantContextService,
        { provide: STYNX_TENANCY_OPTIONS, useValue: {} },
        { provide: STYNX_TENANCY_WINDOW, useValue: null },
      ],
    });
    const tenantContext = TestBed.inject(TenantContextService);
    const fixture = TestBed.createComponent(StynxTenantPickerComponent);

    fixture.componentRef.setInput('tenants', [{ id: 'tenant-a', label: 'Tenant A' }]);
    fixture.detectChanges();
    expect(fixture.componentInstance.shouldRenderPicker()).toBe(false);
    expect(fixture.nativeElement.textContent).not.toContain('Choose a tenant');

    fixture.componentRef.setInput('tenants', [
      { id: 'tenant-a', label: 'Tenant A' },
      { id: 'tenant-b', label: 'Tenant B' },
    ]);
    fixture.detectChanges();
    expect(fixture.componentInstance.shouldRenderPicker()).toBe(true);

    tenantContext.setTenant('tenant-a', 'manual');
    fixture.detectChanges();
    expect(fixture.componentInstance.shouldRenderPicker()).toBe(false);
  });
});
