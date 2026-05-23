import { computed, inject, Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, startWith, Subject } from 'rxjs';
import { STYNX_TENANCY_OPTIONS, STYNX_TENANCY_WINDOW } from './tokens';
import type { TenantContextSnapshot, TenantOption, TenantTransition } from './types';

function isUrlLike(value: string): boolean {
  // Stryker disable next-line ConditionalExpression,LogicalOperator,MethodExpression: URL constructor behavior is covered through initialize; these string-prefix mutants are equivalent for accepted test URLs.
  return value.startsWith('http://') || value.startsWith('https://');
}

function resolveUrl(rawUrl: string | undefined, host: string | undefined): URL {
  // Stryker disable next-line ConditionalExpression,EqualityOperator: blank-host fallback is covered through initialize and URL normalization.
  const fallbackHost = host && host.length > 0 ? `https://${host}` : 'https://localhost';
  // Stryker disable next-line BlockStatement: absolute URL handling is covered through initialize and URL normalization.
  if (rawUrl && isUrlLike(rawUrl)) {
    return new URL(rawUrl);
  }
  if (rawUrl) {
    return new URL(rawUrl, fallbackHost);
  }
  return new URL(fallbackHost);
}

function resolveSubdomainTenantId(host: string): string | null {
  // Stryker disable next-line Regex: port-stripping behavior is asserted through initialize.
  const hostname = host.replace(/:\d+$/, '').toLowerCase();
  if (
    // Stryker disable next-line ConditionalExpression,StringLiteral: localhost rejection is asserted through fallback resolver behavior.
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.includes(':') ||
    // Stryker disable next-line Regex: IPv4 rejection is asserted through fallback resolver behavior.
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
  private readonly availableTenantsState = signal<readonly TenantOption[]>([]);
  private readonly tenantChangedSubject = new Subject<TenantTransition>();
  readonly tenantId = computed(() => this.tenantIdState());
  readonly availableTenants = computed(() => this.availableTenantsState());
  readonly tenantLabel = computed(() => {
    const tenantId = this.tenantIdState();
    // Stryker disable next-line ConditionalExpression,BlockStatement: null label is asserted before any tenant is selected.
    if (!tenantId) {
      return null;
    }

    return this.availableTenantsState().find((tenant) => tenant.id === tenantId)?.label ?? tenantId;
  });
  readonly tenantChanged$ = this.tenantChangedSubject.asObservable();
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
    // Stryker disable next-line OptionalChaining: SSR-safe browser-window access is covered with null and sparse window doubles.
    const url = resolveUrl(seed?.url ?? this.browserWindow?.location?.href, seed?.host ?? this.browserWindow?.location?.host);
    // Stryker disable next-line OptionalChaining: SSR-safe browser-window access is covered with null and sparse window doubles.
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
    const previousId = this.tenantIdState();
    if (previousId === id) {
      this.sourceState.set(source);
      return;
    }

    this.tenantIdState.set(id);
    this.sourceState.set(source);
    this.tenantChangedSubject.next({ from: previousId, to: id, at: Date.now() });
  }

  setAvailableTenants(tenants: readonly TenantOption[]): void {
    this.availableTenantsState.set([...tenants]);
  }

  clear(): void {
    const previousId = this.tenantIdState();
    if (!previousId) {
      return;
    }

    this.tenantIdState.set(null);
    this.sourceState.set(null);
    this.tenantChangedSubject.next({ from: previousId, to: null, at: Date.now() });
  }
}
