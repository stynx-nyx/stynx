import { inject } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { TenantContextService, generateClientRequestId } from '@stynx-nyx/angular';
import { StynxSessionService } from '@stynx-nyx/angular-auth';
import { STYNX_FLOW_CLIENT } from '@stynx-nyx/angular-flow';
import { provideStynxIam } from '@stynx-nyx/angular-iam';
import { StynxSdkClient } from '@stynx-nyx/sdk';
import { environment } from '../../environments/environment';

function createReferenceSdkClient(session: StynxSessionService, tenantContext: TenantContextService): StynxSdkClient {
  return new StynxSdkClient({
    baseUrl: environment.apiBaseUrl,
    // The SDK transport does not mint request ids; STYNX rejects a request
    // without a UUIDv7 X-Request-Id (SM-15), so this client sends one.
    fetchFn: (url, init) =>
      fetch(url, {
        ...(init as RequestInit),
        headers: { 'X-Request-Id': generateClientRequestId(), ...init?.headers },
      }),
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
