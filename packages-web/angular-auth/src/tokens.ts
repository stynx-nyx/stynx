import { InjectionToken } from '@angular/core';
import type { AuthProvider } from '@stynx-nyx/sdk';
import type { StynxAuthBackend, StynxAngularAuthModuleOptions, StynxOidcAdapter } from './types';

export const STYNX_ANGULAR_AUTH_OPTIONS = new InjectionToken<StynxAngularAuthModuleOptions>('STYNX_ANGULAR_AUTH_OPTIONS');
export const STYNX_OIDC_ADAPTER = new InjectionToken<StynxOidcAdapter>('STYNX_OIDC_ADAPTER');
export const STYNX_AUTH_BACKEND = new InjectionToken<StynxAuthBackend>('STYNX_AUTH_BACKEND');
export const STYNX_SESSION_AUTH_PROVIDER = new InjectionToken<AuthProvider>('STYNX_SESSION_AUTH_PROVIDER');
