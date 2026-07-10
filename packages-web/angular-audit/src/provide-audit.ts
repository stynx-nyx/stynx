import { makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import { AuditApiService } from './audit-api.service';
import { STYNX_AUDIT_CLIENT, STYNX_AUDIT_OPTIONS } from './audit-client';
import type { StynxAuditPackageOptions } from './types';

export interface StynxAuditConfig {
  readonly clientFactory: () => StynxSdkClient;
  readonly options?: StynxAuditPackageOptions;
}

export function provideStynxAudit(config: StynxAuditConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: STYNX_AUDIT_CLIENT,
      useFactory: config.clientFactory,
    },
    {
      provide: STYNX_AUDIT_OPTIONS,
      useValue: config.options ?? {},
    },
    AuditApiService,
  ]);
}
