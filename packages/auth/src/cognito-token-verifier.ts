import { URL } from 'node:url';
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import type { AuthVerificationResult, Principal, TokenVerifier } from '@stech/stynx-contracts';

export interface CognitoTokenVerifierOptions {
  issuer: string;
  audience?: string;
  jwksUri?: string;
  enforceTokenUse?: 'id' | 'access';
  roleClaims?: string[];
  permissionClaims?: string[];
  tenantClaims?: string[];
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
}

function getClaim(payload: JWTPayload, key: string): unknown {
  return (payload as Record<string, unknown>)[key];
}

export class CognitoTokenVerifier implements TokenVerifier {
  private readonly jwksUri: string;
  private readonly roleClaims: string[];
  private readonly permissionClaims: string[];
  private readonly tenantClaims: string[];
  private jwks: JWTVerifyGetKey | null = null;

  constructor(private readonly options: CognitoTokenVerifierOptions) {
    this.jwksUri = options.jwksUri ?? `${options.issuer}/.well-known/jwks.json`;
    this.roleClaims = options.roleClaims ?? ['cognito:groups', 'roles'];
    this.permissionClaims = options.permissionClaims ?? ['permissions'];
    this.tenantClaims = options.tenantClaims ?? ['tenants', 'custom:tenant_id', 'https://stynx.dev/tenant'];
  }

  async verifyAuthorizationHeader(value: string | string[] | undefined): Promise<AuthVerificationResult> {
    const authorization = Array.isArray(value) ? value[0] : value;
    if (!authorization?.startsWith('Bearer ')) {
      throw new Error('Missing bearer token');
    }

    const token = authorization.slice('Bearer '.length).trim();
    const { jwtVerify } = await import('jose');
    const verification = await jwtVerify(token, await this.resolveJwks(), { issuer: this.options.issuer });
    const payload = verification.payload;

    this.assertAudience(payload);
    this.assertTokenUse(payload);

    const username = this.readString(payload, 'cognito:username') ?? this.readString(payload, 'username');
    const email = this.readString(payload, 'email');

    const principal: Principal = {
      id: this.resolvePrincipalId(payload),
      roles: this.resolveClaims(payload, this.roleClaims),
      permissions: this.resolveClaims(payload, this.permissionClaims),
      tenants: this.resolveClaims(payload, this.tenantClaims),
      claims: payload as Record<string, unknown>,
      ...(username ? { username } : {}),
      ...(email ? { email } : {}),
    };

    const issuedAt = typeof payload.iat === 'number' ? payload.iat : undefined;
    const expiresAt = typeof payload.exp === 'number' ? payload.exp : undefined;
    const tokenUse = this.readString(payload, 'token_use');

    return {
      principal,
      token,
      ...(typeof issuedAt === 'number' ? { issuedAt } : {}),
      ...(typeof expiresAt === 'number' ? { expiresAt } : {}),
      ...(tokenUse ? { tokenUse } : {}),
    };
  }

  private resolvePrincipalId(payload: JWTPayload): string {
    const candidate = payload.sub ?? this.readString(payload, 'cognito:username') ?? this.readString(payload, 'username');
    if (!candidate) {
      throw new Error('Token missing principal identifier');
    }
    return candidate;
  }

  private resolveClaims(payload: JWTPayload, claimKeys: string[]): string[] {
    const values = claimKeys.flatMap((key) => {
      const claim = getClaim(payload, key);
      if (typeof claim === 'string' && claim.trim().length > 0) {
        return [claim];
      }
      return toStringArray(claim);
    });

    return [...new Set(values.map((v) => v.trim().toLowerCase()).filter(Boolean))];
  }

  private readString(payload: JWTPayload, key: string): string | null {
    const value = getClaim(payload, key);
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private assertAudience(payload: JWTPayload): void {
    const expected = this.options.audience;
    if (!expected) return;

    const aud = payload.aud;
    const clientId = this.readString(payload, 'client_id');
    const azp = this.readString(payload, 'azp');

    const matches =
      (typeof aud === 'string' && aud === expected) ||
      (Array.isArray(aud) && aud.includes(expected)) ||
      clientId === expected ||
      azp === expected;

    if (!matches) {
      throw new Error('Token audience mismatch');
    }
  }

  private assertTokenUse(payload: JWTPayload): void {
    if (!this.options.enforceTokenUse) return;
    const tokenUse = this.readString(payload, 'token_use');
    if (tokenUse !== this.options.enforceTokenUse) {
      throw new Error('Token use mismatch');
    }
  }

  private async resolveJwks(): Promise<JWTVerifyGetKey> {
    if (!this.jwks) {
      const { createRemoteJWKSet } = await import('jose');
      this.jwks = createRemoteJWKSet(new URL(this.jwksUri));
    }
    return this.jwks;
  }
}
