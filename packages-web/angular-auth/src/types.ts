import type { AuthOptions, LoginResponse, OpenIdConfiguration } from 'angular-auth-oidc-client';

export type StynxRefreshTokenStorageMode = 'session-storage' | 'cookie';

export type StynxHostedAuthAction = 'change-password' | 'mfa-enrolment';

export interface StynxHostedAuthActionContext {
  action: StynxHostedAuthAction;
  returnUrl: string;
  state?: string;
  tenantId?: string | null;
  locale?: string | null;
}

export interface StynxHostedAuthActionLink {
  action: StynxHostedAuthAction;
  url: string;
  method: 'browser-redirect';
  opensIn?: 'same-tab' | 'new-tab';
}

export type StynxHostedAuthActionUrlBuilder =
  (context: StynxHostedAuthActionContext) => string | StynxHostedAuthActionLink | null;

export interface StynxHostedAuthActionOptions {
  returnUrl?: string;
  changePassword?: string | StynxHostedAuthActionUrlBuilder;
  mfaEnrolment?: string | StynxHostedAuthActionUrlBuilder;
}

export interface StynxAngularAuthModuleOptions {
  oidc: OpenIdConfiguration;
  loginRedirectRoute?: string;
  permissionDeniedPath?: string;
  hostedActions?: StynxHostedAuthActionOptions;
  /**
   * @deprecated since: 1.x — use permissionDeniedPath.
   */
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
  getHostedActionLink?(
    action: StynxHostedAuthAction,
    context?: Partial<StynxHostedAuthActionContext>,
  ): StynxHostedAuthActionLink | null;
  openHostedAction?(
    action: StynxHostedAuthAction,
    context?: Partial<StynxHostedAuthActionContext>,
  ): void;
}

export interface StynxAuthBackend {
  exchangeCognitoToken(cognitoToken: string, tenantId: string): Promise<StynxSessionBundle>;
  switchTenant(accessToken: string, tenantId: string): Promise<StynxSessionBundle>;
  logout(accessToken: string): Promise<void>;
}
