export type PrincipalId = string;

export interface Principal {
  id: PrincipalId;
  username?: string;
  email?: string;
  roles: string[];
  permissions: string[];
  tenants: string[];
  claims: Record<string, unknown>;
}

export interface AuthVerificationResult {
  principal: Principal;
  token: string;
  issuedAt?: number;
  expiresAt?: number;
  tokenUse?: 'id' | 'access' | string;
}

export interface RequestPrincipalContext {
  principal: Principal;
  tenantId?: string;
  correlationId?: string;
}

export interface TokenVerifier {
  verifyAuthorizationHeader(value: string | string[] | undefined): Promise<AuthVerificationResult>;
}

export interface PrincipalMapper {
  map(result: AuthVerificationResult): Principal;
}
