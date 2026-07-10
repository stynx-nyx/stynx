import '@angular/compiler';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { firstValueFrom, of, type Observable } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from '../src/tokens';

class FakeHeaders {
  private readonly values = new Map<string, string>();

  constructor(seed: Record<string, string> = {}) {
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

function createInterceptor(context: TenantContextService): TenantInterceptor {
  const injector = Injector.create({
    parent: TestBed.inject(Injector),
    providers: [{ provide: TenantContextService, useValue: context }],
  });
  return runInInjectionContext(injector, () => new TenantInterceptor());
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

describe('@stynx-nyx/angular-tenancy W04 tenant contract depth', () => {
  it('exposes resolved manual tenant context to injected consumers and attaches the canonical tenant header', async () => {
    const context = createTenantContext();
    const emitted: Array<string | null> = [];
    context.currentTenantId$.subscribe((tenantId) => emitted.push(tenantId));

    context.setTenant('tenant-w04', 'manual');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const interceptor = createInterceptor(context);
    const handler = new FakeHandler();

    await expect(firstValueFrom(interceptor.intercept(new FakeRequest() as never, handler as never))).resolves.toEqual({
      ok: true,
    });

    expect(context.activeTenant()).toEqual({ id: 'tenant-w04', source: 'manual' });
    expect(emitted).toEqual([null, 'tenant-w04']);
    expect(handler.seen[0]?.headers.get('X-Tenant-Id')).toBe('tenant-w04');
  });

  it('leaves requests unmodified when no tenant resolves so callers can reject missing tenant context explicitly', async () => {
    const context = createTenantContext();
    await context.initialize({ url: 'https://localhost/work', host: 'localhost' });
    const interceptor = createInterceptor(context);
    const handler = new FakeHandler();

    await firstValueFrom(interceptor.intercept(new FakeRequest() as never, handler as never));

    expect(context.activeTenant()).toBe(null);
    expect(handler.seen[0]?.headers.has('X-Tenant-Id')).toBe(false);
  });
});
