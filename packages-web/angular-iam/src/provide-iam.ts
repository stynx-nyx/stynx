import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { IamApiService } from './iam-api.service';
import { STYNX_IAM_CLIENT } from './tokens';

export interface StynxIamConfig {
  clientFactory: () => StynxSdkClient;
}

export function provideStynxIam(config: StynxIamConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: STYNX_IAM_CLIENT,
      useFactory: config.clientFactory,
    },
    IamApiService,
  ]);
}
