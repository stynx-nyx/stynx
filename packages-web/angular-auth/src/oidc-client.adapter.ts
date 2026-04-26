import { Inject, Injectable } from '@angular/core';
import { OidcSecurityService } from 'angular-auth-oidc-client';
import type { AuthOptions, LoginResponse } from 'angular-auth-oidc-client';
import { firstValueFrom } from 'rxjs';
import type { StynxOidcAdapter } from './types';

@Injectable()
export class OidcClientAdapter implements StynxOidcAdapter {
  constructor(@Inject(OidcSecurityService) private readonly oidcSecurity: OidcSecurityService) {}

  checkAuth(url?: string): Promise<LoginResponse> {
    return firstValueFrom(this.oidcSecurity.checkAuth(url));
  }

  authorize(authOptions?: AuthOptions): void {
    this.oidcSecurity.authorize(undefined, authOptions);
  }

  async logoff(): Promise<void> {
    await firstValueFrom(this.oidcSecurity.logoff());
  }

  forceRefreshSession(): Promise<LoginResponse> {
    return firstValueFrom(this.oidcSecurity.forceRefreshSession());
  }
}