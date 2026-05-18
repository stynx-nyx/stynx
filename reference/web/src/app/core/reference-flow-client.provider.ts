import type { Provider } from '@angular/core';
import { TenantContextService } from '@stynx-web/angular';
import { StynxSessionService } from '@stynx-web/angular-auth';
import { STYNX_FLOW_CLIENT } from '@stynx-web/angular-flow';
import { StynxSdkClient } from '@stynx-web/sdk';
import { environment } from '../../environments/environment';

export function provideReferenceFlowClient(): Provider {
  return {
    provide: STYNX_FLOW_CLIENT,
    deps: [StynxSessionService, TenantContextService],
    useFactory: (session: StynxSessionService, tenantContext: TenantContextService) =>
      new StynxSdkClient({
        baseUrl: environment.apiBaseUrl,
        fetchFn: (url, init) => fetch(url, init as RequestInit),
        authProvider: session,
        tenantProvider: {
          getTenantId: () => tenantContext.tenantId(),
        },
      }),
  };
}
