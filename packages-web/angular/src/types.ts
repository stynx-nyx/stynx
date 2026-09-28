import type { AuthProvider } from '@stynx-nyx/sdk';
import type { TenantResolutionContext } from '@stynx-nyx/angular-tenancy';
import type { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import type { StynxErrorClassificationOptions } from './error-classification';

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
  errorBoundary?: StynxErrorBoundaryOptions;
}

export interface StynxErrorBoundaryOptions extends StynxErrorClassificationOptions {
  exclude?: (request: HttpRequest<unknown>, error: HttpErrorResponse) => boolean;
}

export interface ToastMessage {
  id: string;
  kind: 'info' | 'success' | 'warning' | 'error';
  message: string;
}

export interface ErrorBannerState {
  message: string;
  messageKey?: string;
  messageParams?: Record<string, string | number>;
  tone?: 'info' | 'success' | 'warning' | 'error';
  actionLabel?: string;
  action?: () => void | Promise<void>;
  code?: string;
  status?: number;
  context?: Record<string, unknown>;
}
