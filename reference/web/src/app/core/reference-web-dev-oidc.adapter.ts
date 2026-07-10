import { Injectable } from '@angular/core';
import type { AuthOptions, LoginResponse } from 'angular-auth-oidc-client';
import type { StynxOidcAdapter } from '@stynx-nyx/angular-auth';
import { environment } from '../../environments/environment';

type ReferenceLoginState = {
  email: string;
  tenantId?: string;
  state?: string;
  accessToken?: string;
};

const STORAGE_KEY = 'stynx.reference-web.dev-login';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const encoded = token.split('.')[1];
  if (!encoded) {
    return null;
  }

  try {
    const base64 = encoded.replace(/-/gu, '+').replace(/_/gu, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function loadState(): ReferenceLoginState | null {
  if (typeof sessionStorage === 'undefined') {
    return null;
  }
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as ReferenceLoginState;
  } catch {
    return null;
  }
}

function saveState(state: ReferenceLoginState): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

@Injectable()
export class ReferenceWebDevOidcAdapter implements StynxOidcAdapter {
  beginLogin(email: string, tenantId?: string): void {
    saveState(tenantId ? { email, tenantId } : { email });
  }

  clear(): void {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  currentEmail(): string | null {
    return loadState()?.email ?? null;
  }

  async checkAuth(url?: string): Promise<LoginResponse> {
    if (environment.useRealOidc) {
      return this.checkRealOidcAuth(url);
    }

    const email = this.currentEmail();
    if (!email) {
      return { isAuthenticated: false } as LoginResponse;
    }
    return {
      isAuthenticated: true,
      accessToken: `reference-dev:${email}`,
      userData: { email },
    } as LoginResponse;
  }

  authorize(_authOptions?: AuthOptions): void {
    if (!environment.useRealOidc) {
      return;
    }

    const state = loadState();
    if (!state?.email) {
      return;
    }

    const nonce = crypto.randomUUID();
    saveState({ ...state, state: nonce });
    const authorizeUrl = new URL(`${environment.oidcBaseUrl}/authorize`);
    authorizeUrl.searchParams.set('client_id', 'reference-web-dev');
    authorizeUrl.searchParams.set('redirect_uri', `${environment.appBaseUrl}/login`);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid profile email');
    authorizeUrl.searchParams.set('state', nonce);
    authorizeUrl.searchParams.set('login_hint', state.email);
    if (state.tenantId) {
      authorizeUrl.searchParams.set('tenant_id', state.tenantId);
    }
    window.location.assign(authorizeUrl.toString());
  }

  async logoff(): Promise<void> {
    this.clear();
  }

  forceRefreshSession(): Promise<LoginResponse> {
    return this.checkAuth();
  }

  private async checkRealOidcAuth(url?: string): Promise<LoginResponse> {
    const state = loadState();
    const currentUrl = new URL(url ?? window.location.href);
    const code = currentUrl.searchParams.get('code');
    if (!code) {
      if (state?.accessToken) {
        return {
          isAuthenticated: true,
          accessToken: state.accessToken,
          userData: decodeJwtPayload(state.accessToken) ?? undefined,
        } as LoginResponse;
      }
      return { isAuthenticated: false } as LoginResponse;
    }

    const returnedState = currentUrl.searchParams.get('state');
    if (state?.state && returnedState !== state.state) {
      throw new Error('OIDC state mismatch');
    }

    const response = await fetch(`${environment.oidcBaseUrl}/token`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        code,
        client_id: 'reference-web-dev',
        redirect_uri: `${environment.appBaseUrl}/login`,
      }),
    });
    if (!response.ok) {
      throw new Error(`OIDC token exchange failed with ${response.status}`);
    }

    const token = await response.json() as { access_token?: string };
    if (!token.access_token) {
      throw new Error('OIDC token response did not include an access token');
    }

    const payload = decodeJwtPayload(token.access_token);
    const email = typeof payload?.email === 'string' ? payload.email : state?.email ?? '';
    const tenantId = typeof payload?.tenant_id === 'string' ? payload.tenant_id : state?.tenantId;
    saveState(tenantId ? { email, tenantId, accessToken: token.access_token } : { email, accessToken: token.access_token });
    return {
      isAuthenticated: true,
      accessToken: token.access_token,
      userData: payload ?? undefined,
    } as LoginResponse;
  }
}
