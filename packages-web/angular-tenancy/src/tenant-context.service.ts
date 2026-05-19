import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, startWith } from 'rxjs';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from './tokens';
import type { TenantContextSnapshot } from './types';

function isUrlLike(value: string): boolean {
  return value.startsWith('http://') || value.startsWith('https://');
}

function resolveUrl(rawUrl: string | undefined, host: string | undefined): URL {
  const fallbackHost = host && host.length > 0 ? `https://${host}` : 'https://localhost';
  if (rawUrl && isUrlLike(rawUrl)) {
    return new URL(rawUrl);
  }
  if (rawUrl) {
    return new URL(rawUrl, fallbackHost);
  }
  return new URL(fallbackHost);
}

function resolveSubdomainTenantId(host: string): string | null {
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.includes(':') ||
    /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  ) {
    return null;
  }

  const [first] = hostname.split('.');
  return first && first !== 'localhost' ? first : null;
}

@Injectable()
export class TenantContextService {
  private readonly options = inject(STYNX_TENANCY_OPTIONS);
  private readonly browserWindow = inject(STYNX_TENANCY_WINDOW);
  private readonly tenantIdState = signal<string | null>(null);
  private readonly sourceState = signal<TenantContextSnapshot['source'] | null>(null);
  readonly tenantId = computed(() => this.tenantIdState());
  /**
   * @deprecated since: 1.x — use toObservable(this.tenantId) or the signal directly.
   */
  readonly currentTenantId$ = toObservable(this.tenantId).pipe(
    startWith(this.tenantId()),
    distinctUntilChanged(),
  );
  /**
   * @deprecated since: 1.x — use toObservable(this.tenantId) or the signal directly.
   */
  readonly tenantId$ = this.currentTenantId$;
  readonly activeTenant = computed<TenantContextSnapshot | null>(() => {
    const id = this.tenantIdState();
    const source = this.sourceState();
    return id && source ? { id, source } : null;
  });
  /**
   * @deprecated since: 1.x — use toObservable(this.activeTenant) or the signal directly.
   */
  readonly activeTenant$ = toObservable(this.activeTenant).pipe(
    startWith(this.activeTenant()),
    distinctUntilChanged(),
  );

  async initialize(seed?: { url?: string; host?: string }): Promise<void> {
    const url = resolveUrl(seed?.url ?? this.browserWindow?.location?.href, seed?.host ?? this.browserWindow?.location?.host);
    const host = seed?.host ?? this.browserWindow?.location?.host ?? url.host;

    const queryTenant = url.searchParams.get('tenantId') ?? url.searchParams.get('tenant');
    if (queryTenant) {
      this.setTenant(queryTenant, 'query');
      return;
    }

    const subdomainTenant = resolveSubdomainTenantId(host);
    if (subdomainTenant) {
      this.setTenant(subdomainTenant, 'subdomain');
      return;
    }

    const fallback = await this.options.defaultTenantResolver?.({ url, host }) ?? null;
    if (fallback) {
      this.setTenant(fallback, 'default');
    }
  }

  setTenant(id: string, source: TenantContextSnapshot['source'] = 'manual'): void {
    this.tenantIdState.set(id);
    this.sourceState.set(source);
  }

  clear(): void {
    this.tenantIdState.set(null);
    this.sourceState.set(null);
  }
}
