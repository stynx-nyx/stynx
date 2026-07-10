import { InjectionToken } from '@angular/core';
import type { AuthProvider } from '@stynx-nyx/sdk';
import type { StynxAngularModuleOptions } from './types';

export const STYNX_ANGULAR_OPTIONS = new InjectionToken<StynxAngularModuleOptions>('STYNX_ANGULAR_OPTIONS');
export const STYNX_AUTH_PROVIDER = new InjectionToken<AuthProvider | null>('STYNX_AUTH_PROVIDER');
export const STYNX_WINDOW = new InjectionToken<Window | null>('STYNX_WINDOW');
