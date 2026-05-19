import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { StynxSdkClient } from '@stynx-web/sdk';
import type { Observable } from 'rxjs';

export const STYNX_FLOW_CLIENT = new InjectionToken<StynxSdkClient>('STYNX_FLOW_CLIENT');
export const STYNX_FLOW_TENANT_CHANGED = new InjectionToken<Observable<unknown>>('STYNX_FLOW_TENANT_CHANGED');

export function provideStynxFlow(client: StynxSdkClient): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: STYNX_FLOW_CLIENT,
      useValue: client,
    },
  ]);
}
