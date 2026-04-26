import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  BrowserLocalStorageTokenStore,
  FrontendSessionManager,
  buildCognitoHostedUiLoginUrl,
} from '@stech/stynx-frontend-client';
import type { FrontendPrincipal, FrontendTokens } from '@stech/stynx-frontend-contracts';
import { environment } from '../../environments/environment';

const hashParams = (rawHash: string): URLSearchParams => {
  const value = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  return new URLSearchParams(value);
};

const resolveCognitoDomain = (): string => {
  const config = environment.cognito as {
    domain?: string;
    userPoolId?: string;
    region?: string;
  };

  if (config.domain) {
    return config.domain;
  }

  if (config.userPoolId && config.region) {
    return `${config.userPoolId}.auth.${config.region}.amazoncognito.com`;
  }

  throw new Error('Missing cognito domain configuration (domain or userPoolId+region)');
};

@Injectable({ providedIn: 'root' })
export class ReferenceAuthFacade {
  private readonly tokenStore = new BrowserLocalStorageTokenStore('stynx.reference.tokens');
  private readonly sessionManager = new FrontendSessionManager(this.tokenStore, {
    roleClaimKeys: ['roles', 'cognito:groups'],
    permissionClaimKeys: ['permissions', 'scope'],
    tenantClaimKeys: ['tenant_id', 'tenant_ids'],
  });
  private readonly principalSubject = new BehaviorSubject<FrontendPrincipal | null>(null);
  readonly principal$ = this.principalSubject.asObservable();

  constructor() {
    this.refreshPrincipal();
  }

  initFromWindowLocation(): void {
    if (typeof window === 'undefined') {
      return;
    }
    this.hydrateFromCallbackHash(window.location.hash);
  }

  hydrateFromCallbackHash(rawHash: string): void {
    if (!rawHash.includes('access_token=')) {
      this.refreshPrincipal();
      return;
    }

    const params = hashParams(rawHash);
    const accessToken = params.get('access_token');
    if (!accessToken) {
      this.refreshPrincipal();
      return;
    }

    const expiresInSeconds = Number(params.get('expires_in') ?? '3600');
    const tokens: FrontendTokens = {
      accessToken,
      expiresAt: Date.now() + expiresInSeconds * 1000,
      ...(params.get('id_token') ? { idToken: params.get('id_token')! } : {}),
      ...(params.get('refresh_token') ? { refreshToken: params.get('refresh_token')! } : {}),
    };

    const state = this.sessionManager.setTokens(tokens);
    this.principalSubject.next(state.principal);
  }

  beginLogin(): void {
    const config = environment.cognito as {
      clientId: string;
      redirectUrl?: string;
      redirectUri?: string;
      scopes?: string[];
    };

    const url = buildCognitoHostedUiLoginUrl({
      domain: resolveCognitoDomain(),
      clientId: config.clientId,
      redirectUri: config.redirectUrl ?? config.redirectUri ?? `${window.location.origin}/login/callback`,
      scopes: config.scopes ?? ['openid', 'email', 'profile'],
      responseType: 'token',
    });

    if (typeof window !== 'undefined') {
      window.location.assign(url);
    }
  }

  logout(): void {
    this.sessionManager.clear();
    this.principalSubject.next(null);
  }

  getValidAccessToken(): string | null {
    return this.sessionManager.getValidAccessToken();
  }

  getPreferredTenantId(): string | null {
    return this.sessionManager.getTenantId();
  }

  getSessionManager(): FrontendSessionManager {
    return this.sessionManager;
  }

  private refreshPrincipal(): void {
    const state = this.sessionManager.hydrate();
    this.principalSubject.next(state.principal);
  }
}
