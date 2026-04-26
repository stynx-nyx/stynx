import type { AuthOptions, LoginResponse, OpenIdConfiguration } from 'angular-auth-oidc-client';

export type StynxRefreshTokenStorageMode = 'session-storage' | 'cookie';

export interface StynxAngularAuthModuleOptions {
  oidc: OpenIdConfiguration;
  loginRedirectRoute?: string;
  unauthorizedRoute?: string;
  sessionStorageKey?: string;
  refreshTokenStorage?: StynxRefreshTokenStorageMode;
  refreshTokenCookie?: {
    name?: string;
    path?: string;
    sameSite?: 'Strict' | 'Lax' | 'None';
    secure?: boolean;
  };
}

export interface StynxSessionBundle {
  sid: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  expiresAt: string;
  idleExpiresAt: string;
  permissions?: string[];
}

export interface StynxSessionState {
  active: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  sid: string | null;
  permissions: string[];
  tenantId: string | null;
  claims: Record<string, unknown> | null;
}

export interface StynxOidcAdapter {
  checkAuth(url?: string): Promise<LoginResponse>;
  authorize(authOptions?: AuthOptions): void;
  logoff(): Promise<void>;
  forceRefreshSession(): Promise<LoginResponse>;
}

export interface StynxAuthBackend {
  exchangeCognitoToken(cognitoToken: string, tenantId: string): Promise<StynxSessionBundle>;
  switchTenant(accessToken: string, tenantId: string): Promise<StynxSessionBundle>;
  logout(accessToken: string): Promise<void>;
}
