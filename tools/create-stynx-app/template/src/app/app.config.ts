import { inject } from '@angular/core';
import type { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStynxDefaults, TenantContextService } from '@stynx-web/angular';
import { provideStynxAuth, StynxSessionService } from '@stynx-web/angular-auth';
import { provideStynxFlow } from '@stynx-web/angular-flow';
import { StynxSdkClient } from '@stynx-web/sdk';

const apiBaseUrl = 'http://127.0.0.1:3000';
const defaultTenantId = 'demo-tenant';

function appOrigin(): string {
  return typeof window === 'undefined' ? 'http://127.0.0.1:4200' : window.location.origin;
}

function createStynxClient(): StynxSdkClient {
  const session = inject(StynxSessionService);
  const tenantContext = inject(TenantContextService);

  return new StynxSdkClient({
    baseUrl: apiBaseUrl,
    fetchFn: (url, init) => fetch(url, init as RequestInit),
    authProvider: session,
    tenantProvider: {
      getTenantId: () => tenantContext.tenantId(),
    },
  });
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter([]),
    provideStynxDefaults({
      angular: {
        apiBaseUrl,
        sessionMode: 'bearer',
        defaultTenantResolver: ({ url }) => url.searchParams.get('tenant') ?? defaultTenantId,
      },
      auth: provideStynxAuth({
        oidc: {
          authority: `${apiBaseUrl}/auth/oidc`,
          clientId: '__PACKAGE_NAME__',
          redirectUrl: `${appOrigin()}/auth/callback`,
          postLogoutRedirectUri: appOrigin(),
          scope: 'openid profile email',
          responseType: 'code',
          silentRenew: true,
          useRefreshToken: true,
          secureRoutes: [apiBaseUrl],
        },
        loginRedirectRoute: '/auth/callback',
        permissionDeniedPath: '/forbidden',
      }),
      flow: provideStynxFlow({
        clientFactory: createStynxClient,
      }),
    }),
  ],
};
