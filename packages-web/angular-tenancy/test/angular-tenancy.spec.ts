import '@angular/compiler';
import { of, firstValueFrom, type Observable } from 'rxjs';
import { TenantContextService } from '../src/tenant-context.service';
import { TenantInterceptor } from '../src/tenant.interceptor';

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

describe('@stynx-web/angular-tenancy', () => {
  it('adds X-Tenant-Id from the current tenant context', async () => {
    const tenantContext = new TenantContextService({}, null);
    tenantContext.setTenant('tenant-a', 'manual');
    const interceptor = new TenantInterceptor(tenantContext);
    const handler = new FakeHandler();

    await expect(firstValueFrom(interceptor.intercept(new FakeRequest() as never, handler as never))).resolves.toEqual({
      ok: true,
    });

    expect(handler.seen[0]?.headers.get('x-tenant-id')).toBe('tenant-a');
  });
});
