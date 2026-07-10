import { InjectionToken } from '@angular/core';
import type { StynxSdkClient } from '@stynx-nyx/sdk';

export const STYNX_IAM_CLIENT = new InjectionToken<StynxSdkClient>('STYNX_IAM_CLIENT');
