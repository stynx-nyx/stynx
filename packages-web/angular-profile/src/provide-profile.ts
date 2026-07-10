import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { ProfileService } from './profile.service';
import { STYNX_PROFILE_CLIENT } from './tokens';

export interface StynxProfileConfig {
  clientFactory: () => StynxSdkClient;
}

export function provideStynxProfile(config: StynxProfileConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: STYNX_PROFILE_CLIENT,
      useFactory: config.clientFactory,
    },
    ProfileService,
  ]);
}
