import { Injectable } from '@angular/core';
import type { AuthOptions, LoginResponse } from 'angular-auth-oidc-client';
import type { StynxOidcAdapter } from '@stynx-web/angular-auth';

type ReferenceLoginState = {
  email: string;
};

const STORAGE_KEY = 'stynx.reference-web.dev-login';

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

@Injectable()
export class ReferenceWebDevOidcAdapter implements StynxOidcAdapter {
  beginLogin(email: string): void {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ email }));
  }

  currentEmail(): string | null {
    return loadState()?.email ?? null;
  }

  checkAuth(): Promise<LoginResponse> {
    const email = this.currentEmail();
    if (!email) {
      return Promise.resolve({ isAuthenticated: false } as LoginResponse);
    }
    return Promise.resolve({
      isAuthenticated: true,
      accessToken: `reference-dev:${email}`,
      userData: { email },
    } as LoginResponse);
  }

  authorize(_authOptions?: AuthOptions): void {}

  async logoff(): Promise<void> {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  forceRefreshSession(): Promise<LoginResponse> {
    return this.checkAuth();
  }
}
