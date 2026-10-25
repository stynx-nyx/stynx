import { URL } from 'node:url';
// C-4 F-19: jose@6 is ESM-only; TS1479 fires for adopters whose tsconfig
// depth > 2 (reference-api at 2 levels typechecks without this; domain/
// demo-bookmark/api at 3 levels does not, despite identical resolved
// tsconfigs). @ts-ignore (not @ts-expect-error) because the error doesn't
// fire for shallower projects — TS would complain about an unused expect-
// error there. Type-only import so this is purely a typecheck-time
// annotation; emits nothing at runtime.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import type { JWTPayload, JWTVerifyGetKey } from 'jose';
import {
  InvalidCredentialError,
  type AuthVerificationResult,
  type Principal,
  type TokenVerifier,
} from '@stynx-nyx/contracts';

const INVALID_TOKEN_CODES = new Set([
  'ERR_JWT_CLAIM_VALIDATION_FAILED',
  'ERR_JWT_EXPIRED',
  'ERR_JWT_INVALID',
  'ERR_JWS_INVALID',
  'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
  'ERR_JOSE_ALG_NOT_ALLOWED',
]);

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
  return value.filter(
    (entry): entry is string => typeof entry === 'string' && entry.trim().length > 0,
  );
}

function getClaim(payload: JWTPayload, key: string): unknown {
  return payload[key];
}

function readAuthorizationMethod(value: unknown, key: 'startsWith' | 'slice' | 'trim'): unknown {
  if (value === null || value === undefined) {
    throw new TypeError(`Cannot read properties of ${value} (reading '${key}')`);
  }
  const target: unknown = Object(value);
  if (target !== null && (typeof target === 'object' || typeof target === 'function')) {
    return Reflect.get(target, key, value);
  }
  throw new TypeError('Authorization method receiver is unavailable');
}

function hasBearerPrefix(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  const method = readAuthorizationMethod(value, 'startsWith');
  if (typeof method !== 'function') {
    throw new TypeError('authorization?.startsWith is not a function');
  }
  return Reflect.apply(method, value, ['Bearer ']);
}

function sliceBearerToken(value: unknown): unknown {
  const method = readAuthorizationMethod(value, 'slice');
  if (typeof method !== 'function') {
    throw new TypeError('authorization.slice is not a function');
  }
  return Reflect.apply(method, value, ['Bearer '.length]);
}

function trimBearerToken(value: unknown): unknown {
  const method = readAuthorizationMethod(value, 'trim');
  if (typeof method !== 'function') {
    throw new TypeError('authorization.slice(...).trim is not a function');
  }
  return Reflect.apply(method, value, []);
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
    this.tenantClaims = options.tenantClaims ?? [
      'tenants',
      'custom:tenant_id',
      'https://stynx.dev/tenant',
    ];
  }

  async verifyAuthorizationHeader(value: unknown): Promise<AuthVerificationResult> {
    const authorization: unknown = Array.isArray(value) ? value[0] : value;
    if (!hasBearerPrefix(authorization)) {
      throw new InvalidCredentialError('Missing bearer token');
    }

    const extractedToken = trimBearerToken(sliceBearerToken(authorization));
    const { jwtVerify, errors } = await import('jose');
    const jwks = await this.resolveJwks();
    let verification: Awaited<ReturnType<typeof jwtVerify>>;
    let token: string | Uint8Array;
    try {
      const verificationOptions = { issuer: this.options.issuer };
      if (typeof extractedToken !== 'string' && !(extractedToken instanceof Uint8Array)) {
        throw new errors.JWSInvalid('Compact JWS must be a string or Uint8Array');
      }
      token = extractedToken;
      verification = await jwtVerify(token, jwks, verificationOptions);
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        INVALID_TOKEN_CODES.has(String(error.code))
      ) {
        throw new InvalidCredentialError(
          error instanceof Error ? error.message : 'Invalid bearer token',
        );
      }
      throw error;
    }
    const payload = verification.payload;

    this.assertAudience(payload);
    this.assertTokenUse(payload);

    const username =
      this.readString(payload, 'cognito:username') ?? this.readString(payload, 'username');
    const email = this.readString(payload, 'email');

    const principal: Principal = {
      id: this.resolvePrincipalId(payload),
      roles: this.resolveClaims(payload, this.roleClaims),
      permissions: this.resolveClaims(payload, this.permissionClaims),
      tenants: this.resolveClaims(payload, this.tenantClaims),
      claims: payload,
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
    const candidate =
      payload.sub ??
      this.readString(payload, 'cognito:username') ??
      this.readString(payload, 'username');
    if (!candidate) {
      throw new InvalidCredentialError('Token missing principal identifier');
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
      throw new InvalidCredentialError('Token audience mismatch');
    }
  }

  private assertTokenUse(payload: JWTPayload): void {
    if (!this.options.enforceTokenUse) return;
    const tokenUse = this.readString(payload, 'token_use');
    if (tokenUse !== this.options.enforceTokenUse) {
      throw new InvalidCredentialError('Token use mismatch');
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
