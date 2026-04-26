export interface FrontendTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface FrontendPrincipal {
  sub: string;
  username?: string;
  email?: string;
  tenantId?: string | null;
  tenantIds: string[];
  roles: string[];
  permissions: string[];
  rawClaims?: Record<string, unknown>;
}

export interface FrontendAuthState {
  tokens: FrontendTokens | null;
  principal: FrontendPrincipal | null;
}

export interface FrontendTokenStore {
  read(): FrontendTokens | null;
  write(tokens: FrontendTokens): void;
  clear(): void;
}
