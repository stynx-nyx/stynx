import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { STYNX_ANGULAR_OPTIONS } from '@stynx-web/angular';
import type { StynxAngularModuleOptions } from '@stynx-web/angular';
import type { StynxAuthBackend, StynxSessionBundle } from './types';

function trimEdgeSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

@Injectable()
export class HttpAuthBackend implements StynxAuthBackend {
  private readonly http = inject(HttpClient);
  private readonly angularOptions = inject<StynxAngularModuleOptions>(STYNX_ANGULAR_OPTIONS);

  async exchangeCognitoToken(cognitoToken: string, tenantId: string): Promise<StynxSessionBundle> {
    return firstValueFrom(this.http.post<StynxSessionBundle>(
      `${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/sessions`,
      { cognitoToken },
      {
        headers: new HttpHeaders({
          'x-tenant-id': tenantId,
        }),
      },
    ));
  }

  async switchTenant(accessToken: string, tenantId: string): Promise<StynxSessionBundle> {
    return firstValueFrom(this.http.post<StynxSessionBundle>(
      `${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/sessions/switch`,
      { tenantId },
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${accessToken}`,
          'x-tenant-id': tenantId,
        }),
      },
    ));
  }

  async logout(accessToken: string): Promise<void> {
    await firstValueFrom(this.http.post(
      `${trimEdgeSlash(this.angularOptions.apiBaseUrl)}/sessions/logout`,
      {},
      {
        headers: new HttpHeaders({
          Authorization: `Bearer ${accessToken}`,
        }),
      },
    ));
  }
}
