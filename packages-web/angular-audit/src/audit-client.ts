import { InjectionToken } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';
import type { StynxAuditPackageOptions } from './types';

export const STYNX_AUDIT_CLIENT = new InjectionToken<StynxSdkClient>('STYNX_AUDIT_CLIENT');
export const STYNX_AUDIT_OPTIONS = new InjectionToken<StynxAuditPackageOptions>('STYNX_AUDIT_OPTIONS', {
  factory: () => ({}),
});
