import { inject } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { TenantContextService } from '@stynx-nyx/angular';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { STYNX_FLOW_CLIENT } from '@stynx-nyx/angular-flow';
import { provideStynxIam } from '@stynx-nyx/angular-iam';
import { StynxSdkClient } from '@stynx-nyx/sdk';
import { environment } from '../../environments/environment';

function createReferenceSdkClient(session: StynxSessionService, tenantContext: TenantContextService): StynxSdkClient {
  return new StynxSdkClient({
    baseUrl: environment.apiBaseUrl,
    fetchFn: (url, init) => fetch(url, init as RequestInit),
    authProvider: session,
    tenantProvider: {
      getTenantId: () => tenantContext.tenantId(),
    },
  });
}

export function provideReferenceFlowClient(): Provider {
  return {
    provide: STYNX_FLOW_CLIENT,
    deps: [StynxSessionService, TenantContextService],
    useFactory: createReferenceSdkClient,
  };
}

export function provideReferenceIamClient(): EnvironmentProviders {
  return provideStynxIam({
    clientFactory: () => createReferenceSdkClient(
      inject(StynxSessionService),
      inject(TenantContextService),
    ),
  });
}
