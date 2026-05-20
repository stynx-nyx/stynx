import { InjectionToken } from '@angular/core';
import type { StynxSessionsAdapter, StynxSessionsSdkClient } from './types';

export const STYNX_SESSIONS_CLIENT =
  new InjectionToken<StynxSessionsSdkClient>('STYNX_SESSIONS_CLIENT');

export const STYNX_SESSIONS_ADAPTER =
  new InjectionToken<StynxSessionsAdapter>('STYNX_SESSIONS_ADAPTER');
