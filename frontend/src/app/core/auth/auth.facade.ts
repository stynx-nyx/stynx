import { Injectable, inject } from '@angular/core';
import { BehaviorSubject, tap } from 'rxjs';
import { CognitoAuthService, AuthTokens } from './cognito-auth.service';
import { ApiService } from '@core/api/api.service';

export interface AuthUser {
  id: string;
  roles: string[];
  tenants: string[];
  tenantId: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthFacade {
  private readonly cognito = inject(CognitoAuthService);
  private readonly api = inject(ApiService);
  private readonly userSubject = new BehaviorSubject<AuthUser | null>(null);
  readonly user$ = this.userSubject.asObservable();

  constructor() {
    this.cognito.user$
      .pipe(
        tap((tokens) => {
          if (tokens?.accessToken) {
            this.fetchProfile().subscribe();
          } else {
            this.userSubject.next(null);
          }
        }),
      )
      .subscribe();
  }

  login(): void {
    this.cognito.login();
  }

  logout(): void {
    this.cognito.logout();
    this.userSubject.next(null);
  }

  setTokens(tokens: AuthTokens): void {
    this.cognito.setTokens(tokens);
  }

  fetchProfile() {
    return this.api.get<AuthUser>('/auth/me').pipe(
      tap((user) => this.userSubject.next(user)),
    );
  }

  getAccessToken(): string | null {
    return this.cognito.getAccessToken();
  }
  getPreferredTenant(): string | null {
    const user = this.userSubject.value;
    if (!user) {
      return null;
    }
    return user.tenantId ?? user.tenants?.[0] ?? null;
  }

}
