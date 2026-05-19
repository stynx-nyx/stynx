import { InjectionToken } from '@angular/core';
import type { StynxSdkClient } from '@stynx-web/sdk';

export const STYNX_AUDIT_CLIENT = new InjectionToken<StynxSdkClient>('STYNX_AUDIT_CLIENT');
