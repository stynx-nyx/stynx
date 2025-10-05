import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { environment } from '@env/environment';

export interface AuthTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

@Injectable({ providedIn: 'root' })
export class CognitoAuthService {
  private readonly storageKey = 'stc-auth-tokens';
  private readonly userSubject = new BehaviorSubject<AuthTokens | null>(null);
  readonly user$ = this.userSubject.asObservable();

  constructor() {
    const raw = localStorage.getItem(this.storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AuthTokens;
        if (!parsed.expiresAt || parsed.expiresAt > Date.now()) {
          this.userSubject.next(parsed);
        }
      } catch (err) {
        console.warn('Unable to parse stored auth tokens', err);
      }
    }
  }

  login(): void {
    const { userPoolId, clientId, region } = environment.cognito;
    const redirectUri = encodeURIComponent(window.location.origin + '/login');
    const domain = `${userPoolId}.auth.${region}.amazoncognito.com`;
    const url = `https://${domain}/login?client_id=${clientId}&response_type=token&scope=email+openid+profile&redirect_uri=${redirectUri}`;
    window.location.href = url;
  }

  logout(): void {
    localStorage.removeItem(this.storageKey);
    this.userSubject.next(null);
  }

  setTokens(tokens: AuthTokens): void {
    const record = { ...tokens, expiresAt: tokens.expiresAt ?? Date.now() + 3600 * 1000 };
    localStorage.setItem(this.storageKey, JSON.stringify(record));
    this.userSubject.next(record);
  }

  getAccessToken(): string | null {
    const value = this.userSubject.value;
    if (!value) {
      return null;
    }
    if (value.expiresAt && value.expiresAt <= Date.now()) {
      this.logout();
      return null;
    }
    return value.accessToken;
  }
}
