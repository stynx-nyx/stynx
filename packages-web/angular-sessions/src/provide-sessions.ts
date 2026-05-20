import { inject, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders, Provider } from '@angular/core';
import { SdkSessionsAdapter } from './sdk-sessions.adapter';
import { STYNX_SESSIONS_ADAPTER, STYNX_SESSIONS_CLIENT } from './tokens';
import type { StynxSessionsAdapter, StynxSessionsSdkClient } from './types';

export interface StynxSessionsConfig {
  clientFactory?: () => StynxSessionsSdkClient;
  adapter?: StynxSessionsAdapter | (() => StynxSessionsAdapter);
}

export function provideStynxSessions(config: StynxSessionsConfig = {}): EnvironmentProviders {
  const providers: Provider[] = [
    SdkSessionsAdapter,
    {
      provide: STYNX_SESSIONS_ADAPTER,
      useFactory: () => {
        if (config.adapter) {
          return typeof config.adapter === 'function' ? config.adapter() : config.adapter;
        }
        return inject(SdkSessionsAdapter);
      },
    },
  ];

  if (config.clientFactory) {
    providers.push({
      provide: STYNX_SESSIONS_CLIENT,
      useFactory: config.clientFactory,
    });
  }

  return makeEnvironmentProviders(providers);
}
