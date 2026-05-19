import type { AuthProvider } from '@stynx-web/sdk';
import type { TenantResolutionContext } from '@stynx-web/angular-tenancy';

export type SessionMode = 'bearer' | 'cookie';

export interface StynxAngularCognitoConfig {
  domain?: string;
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface StynxAngularModuleOptions {
  apiBaseUrl: string;
  cognito?: StynxAngularCognitoConfig;
  sessionMode: SessionMode;
  authProvider?: AuthProvider;
  defaultTenantResolver?: (context: TenantResolutionContext) => Promise<string | null> | string | null;
  cspNonce?: string;
}

export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ErrorBannerState {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'error';
  actionLabel?: string;
  action?: () => void | Promise<void>;
  code?: string;
  status?: number;
  context?: Record<string, unknown>;
}
