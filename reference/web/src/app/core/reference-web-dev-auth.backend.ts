import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import type { StynxAuthBackend, StynxSessionBundle } from '@stynx-web/angular-auth';
import { environment } from '../../environments/environment';
import { ReferenceWebDevOidcAdapter } from './reference-web-dev-oidc.adapter';

@Injectable()
export class ReferenceWebDevAuthBackend implements StynxAuthBackend {
  private readonly http = inject(HttpClient);
  private readonly oidc = inject(ReferenceWebDevOidcAdapter);

  exchangeCognitoToken(cognitoToken: string, tenantId: string): Promise<StynxSessionBundle> {
    return this.runDevLogin(cognitoToken, tenantId);
  }

  switchTenant(_accessToken: string, tenantId: string): Promise<StynxSessionBundle> {
    return this.runDevLogin(this.oidc.currentEmail() ?? '', tenantId);
  }

  async logout(accessToken: string): Promise<void> {
    await firstValueFrom(
      this.http.post(
        `${environment.apiBaseUrl}/sessions/logout`,
        {},
        {
          headers: new HttpHeaders({
            Authorization: `Bearer ${accessToken}`,
          }),
        },
      ),
    );
    await this.oidc.logoff();
  }

  private runDevLogin(cognitoToken: string, tenantId: string): Promise<StynxSessionBundle> {
    const fallbackEmail = cognitoToken.startsWith('reference-dev:') ? cognitoToken.slice('reference-dev:'.length) : cognitoToken;
    const email = this.oidc.currentEmail() ?? fallbackEmail;
    return firstValueFrom(
      this.http.post<StynxSessionBundle>(`${environment.apiBaseUrl}/_reference/dev-login`, {
        email,
        tenantId,
      }),
    );
  }
}
