import { computed, signal } from '@angular/core';
import { Inject, Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS, STYNX_WINDOW } from './tokens';
import type { StynxAngularModuleOptions, TenantContextSnapshot } from './types';

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
    hostname === 'localhost'
    || hostname.endsWith('.localhost')
    || hostname.includes(':')
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  ) {
    return null;
  }

  const [first] = hostname.split('.');
  return first && first !== 'localhost' ? first : null;
}

@Injectable()
export class TenantContextService {
  private readonly tenantIdState = signal<string | null>(null);
  private readonly sourceState = signal<TenantContextSnapshot['source'] | null>(null);
  private readonly tenantIdSubject = new BehaviorSubject<string | null>(null);
  private readonly activeTenantSubject = new BehaviorSubject<TenantContextSnapshot | null>(null);
  readonly tenantId = computed(() => this.tenantIdState());
  readonly activeTenant = computed<TenantContextSnapshot | null>(() => {
    const id = this.tenantIdState();
    const source = this.sourceState();
    return id && source ? { id, source } : null;
  });
  readonly tenantId$ = this.tenantIdSubject.asObservable();
  readonly activeTenant$ = this.activeTenantSubject.asObservable();

  constructor(
    @Inject(STYNX_ANGULAR_OPTIONS)
    private readonly options: StynxAngularModuleOptions,
    @Inject(STYNX_WINDOW)
    private readonly browserWindow: Window | null,
  ) {}

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
    this.tenantIdSubject.next(id);
    this.activeTenantSubject.next({ id, source });
  }

  clear(): void {
    this.tenantIdState.set(null);
    this.sourceState.set(null);
    this.tenantIdSubject.next(null);
    this.activeTenantSubject.next(null);
  }
}
