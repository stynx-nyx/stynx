import { Injectable, computed, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { distinctUntilChanged, startWith } from 'rxjs';
import { TenantContextService } from '@stynx-web/angular';
import type { AuthProvider } from '@stynx-web/sdk';
import { STYNX_ANGULAR_AUTH_OPTIONS, STYNX_AUTH_BACKEND, STYNX_OIDC_ADAPTER } from './tokens';
import { parseJwtPayload, normalizePermissions } from './jwt';
import { RefreshTokenStorage } from './storage';
import type {
  StynxSessionBundle,
  StynxSessionState,
} from './types';

const INACTIVE_STATE: StynxSessionState = {
  active: false,
  accessToken: null,
  refreshToken: null,
  sid: null,
  permissions: [],
  tenantId: null,
  claims: null,
};

@Injectable()
export class StynxSessionService implements AuthProvider {
  private readonly tenantContext = inject(TenantContextService);
  private readonly oidc = inject(STYNX_OIDC_ADAPTER);
  private readonly backend = inject(STYNX_AUTH_BACKEND);
  private readonly options = inject(STYNX_ANGULAR_AUTH_OPTIONS);
  private readonly stateSignal = signal<StynxSessionState>({ ...INACTIVE_STATE });
  private readonly refreshStorage = new RefreshTokenStorage(
    this.options.sessionStorageKey ?? 'stynx.angular-auth.refresh-token',
    this.options.refreshTokenStorage ?? 'session-storage',
    undefined,
    undefined,
    this.options.refreshTokenCookie,
  );
  readonly state = this.stateSignal.asReadonly();
  readonly active = computed(() => this.stateSignal().active);
  /**
   * @deprecated since: 1.x — use toObservable(this.state) or the signal directly.
   */
  readonly active$ = toObservable(this.state).pipe(
    startWith(this.state()),
    distinctUntilChanged(),
  );

  login(): void {
    this.oidc.authorize();
  }

  async completeLogin(url?: string): Promise<StynxSessionState> {
    const login = await this.oidc.checkAuth(url);
    if (!login.isAuthenticated || !login.accessToken) {
      this.clearState();
      return this.stateSignal();
    }

    if (!this.tenantContext.tenantId()) {
      await this.tenantContext.initialize();
    }
    if (!this.tenantContext.tenantId() && url) {
      await this.tenantContext.initialize({ url });
    }
    const tenantId = this.resolveTenantId(login.accessToken);
    const bundle = await this.backend.exchangeCognitoToken(login.accessToken, tenantId);
    this.tenantContext.setTenant(tenantId, 'manual');
    return this.applyBundle(bundle, tenantId);
  }

  async logout(): Promise<void> {
    const accessToken = this.stateSignal().accessToken;
    if (accessToken) {
      await this.backend.logout(accessToken).catch(() => undefined);
    }
    this.clearState();
    await this.oidc.logoff();
  }

  getAccessToken(): Promise<string | null> {
    return Promise.resolve(this.stateSignal().accessToken);
  }

  async refresh(): Promise<string | null> {
    const currentTenant = this.stateSignal().tenantId ?? this.tenantContext.tenantId();
    if (!currentTenant) {
      return null;
    }
    const refreshed = await this.oidc.forceRefreshSession();
    if (!refreshed.isAuthenticated || !refreshed.accessToken) {
      this.clearState();
      return null;
    }
    const bundle = await this.backend.exchangeCognitoToken(refreshed.accessToken, currentTenant);
    const state = this.applyBundle(bundle, currentTenant);
    return state.accessToken;
  }

  async onAuthFailure(): Promise<void> {
    this.clearState();
  }

  async switchTenant(tenantId: string): Promise<StynxSessionState> {
    const accessToken = this.stateSignal().accessToken;
    if (!accessToken) {
      throw new Error('No active STYNX access token');
    }
    const bundle = await this.backend.switchTenant(accessToken, tenantId);
    this.tenantContext.setTenant(tenantId, 'manual');
    return this.applyBundle(bundle, tenantId);
  }

  hasAllPermissions(required: string[]): boolean {
    const granted = new Set(this.stateSignal().permissions);
    return required.every((permission) => granted.has(permission));
  }

  hasAnyPermissions(required: string[]): boolean {
    const granted = new Set(this.stateSignal().permissions);
    return required.some((permission) => granted.has(permission));
  }

  snapshot(): StynxSessionState {
    return this.stateSignal();
  }

  private resolveTenantId(cognitoAccessToken: string): string {
    const fromContext = this.tenantContext.tenantId();
    if (fromContext) {
      return fromContext;
    }
    const payload = parseJwtPayload(cognitoAccessToken);
    const candidate = payload?.tenant_id ?? payload?.tenantId ?? payload?.tenancy_id;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
    throw new Error('Tenant context is required for session exchange');
  }

  private applyBundle(bundle: StynxSessionBundle, tenantId: string): StynxSessionState {
    this.refreshStorage.write(bundle.refreshToken);
    const claims = parseJwtPayload(bundle.accessToken);
    const next: StynxSessionState = {
      active: true,
      accessToken: bundle.accessToken,
      refreshToken: bundle.refreshToken,
      sid: bundle.sid,
      permissions: bundle.permissions ?? normalizePermissions(claims),
      tenantId,
      claims,
    };
    this.stateSignal.set(next);
    return next;
  }

  private clearState(): void {
    this.refreshStorage.clear();
    this.stateSignal.set({ ...INACTIVE_STATE });
  }
}
