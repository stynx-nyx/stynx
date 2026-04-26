import type { AuthProvider } from '@stynx-web/sdk';

export type SessionMode = 'bearer' | 'cookie';

export interface TenantContextSnapshot {
  id: string;
  source: 'query' | 'subdomain' | 'default' | 'manual';
}

export interface StynxAngularCognitoConfig {
  domain?: string;
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
}

export interface TenantResolutionContext {
  url: URL;
  host: string;
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
  code?: string;
  status?: number;
  context?: Record<string, unknown>;
}
