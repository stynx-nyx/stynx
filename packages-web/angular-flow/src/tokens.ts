import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { StynxSdkClient } from '@stynx-web/sdk';

export const STYNX_FLOW_CLIENT = new InjectionToken<StynxSdkClient>('STYNX_FLOW_CLIENT');

export function provideStynxFlow(client: StynxSdkClient): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: STYNX_FLOW_CLIENT,
      useValue: client,
    },
  ]);
}
