import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { createPublicKey } from 'node:crypto';
import { SessionJwtSigningService } from '@stynx-nyx/sessions';
import { InvalidCredentialError } from '@stynx-nyx/contracts';
import { STYNX_AUTH_OPTIONS } from './tokens';
import type { ResolvedStynxAuthModuleOptions, StynxAccessTokenClaims } from './types';
import { decodeJwtClaims, verifyJwtWithJwk } from './utils';

interface CachedKeySet {
  expiresAt: number;
  version: number;
  source: SessionJwtSigningService | string;
  keys: Array<Record<string, string | undefined>>;
}

interface RefreshState {
  lastStartedAt?: number;
  inFlight?: Promise<CachedKeySet>;
}

@Injectable()
export class StynxJwtValidator {
  private cache?: CachedKeySet;
  private cacheVersion = 0;
  private readonly refreshStates = new Map<SessionJwtSigningService | string, RefreshState>();

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_AUTH_OPTIONS)
    private readonly options: ResolvedStynxAuthModuleOptions,
  ) {}

  async validate(token: string): Promise<StynxAccessTokenClaims> {
    // Token syntax is independent of the availability of signing keys.
    const decoded = decodeJwtClaims(token);
    if (decoded.header.alg !== 'RS256') throw new InvalidCredentialError('JWT is malformed');
    const signingService = this.moduleRef.get(SessionJwtSigningService, { strict: false });
    const initial = await this.resolveKeys(false, signingService);
    const payload = this.verifySignature(token, initial.keys);
    if (payload) return this.validateClaims(payload);

    const refreshed = await this.refreshAfterSignatureMiss(initial, signingService);
    const retriedPayload = this.verifySignature(token, refreshed.keys);
    if (!retriedPayload) throw new InvalidCredentialError('STYNX access token verification failed');
    return this.validateClaims(retriedPayload);
  }

  private verifySignature(token: string, keys: CachedKeySet['keys']): Record<string, unknown> | null {
    for (const key of keys) {
      try {
        return verifyJwtWithJwk(token, key);
      } catch (error) {
        if (!(error instanceof InvalidCredentialError)) throw error;
      }
    }
    return null;
  }

  private validateClaims(payload: Record<string, unknown>): StynxAccessTokenClaims {
    if (payload.iss !== this.options.stynx.issuer) {
      throw new InvalidCredentialError('STYNX token issuer mismatch');
    }
    if (this.options.stynx.audience && payload.aud !== this.options.stynx.audience) {
      throw new InvalidCredentialError('STYNX token audience mismatch');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
      throw new InvalidCredentialError('STYNX token expired');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + 5) {
      throw new InvalidCredentialError('STYNX token not active yet');
    }

    return {
      sub: String(payload.sub ?? ''),
      sid: String(payload.sid ?? ''),
      tenantId: String(payload.tenant_id ?? ''),
      ...(typeof payload.perms_hash === 'string' ? { permsHash: payload.perms_hash } : {}),
      ...(typeof payload.cognito_sub === 'string' ? { cognitoSub: payload.cognito_sub } : {}),
      ...(typeof payload.iat === 'number' ? { issuedAt: payload.iat } : {}),
      ...(typeof payload.exp === 'number' ? { expiresAt: payload.exp } : {}),
      claims: payload,
    };
  }

  private async refreshAfterSignatureMiss(
    initial: CachedKeySet,
    signingService?: SessionJwtSigningService,
  ): Promise<CachedKeySet> {
    const state = this.refreshStates.get(initial.source) ?? {};
    this.refreshStates.set(initial.source, state);
    if (state.inFlight) return state.inFlight;

    const newer = this.cache;
    if (newer?.source === initial.source && newer.version > initial.version) return newer;

    const now = Date.now();
    if (state.lastStartedAt !== undefined && now - state.lastStartedAt < 30_000) {
      throw new Error('STYNX JWKS refresh suppressed after signature miss');
    }
    state.lastStartedAt = now;
    const refresh = this.resolveKeys(true, signingService);
    state.inFlight = refresh;
    try {
      return await refresh;
    } finally {
      if (state.inFlight === refresh) delete state.inFlight;
    }
  }

  private async resolveKeys(
    forceRefresh: boolean,
    signingService?: SessionJwtSigningService,
  ): Promise<CachedKeySet> {
    const now = Date.now();
    const source = signingService ?? this.options.stynx.jwksUri;
    if (!source) throw new Error('No STYNX JWKS source configured');
    if (!forceRefresh && this.cache?.source === source && this.cache.expiresAt > now) {
      return this.cache;
    }
    const startedAtVersion = this.cacheVersion;

    let jwks: unknown;
    if (signingService) {
      jwks = await signingService.getJwks();
    } else {
      const response = await fetch(source as string);
      if (!response.ok) throw new Error(`Failed to load STYNX JWKS: ${response.status}`);
      jwks = await response.json();
    }

    const rawKeys = jwks && typeof jwks === 'object' && 'keys' in jwks ? jwks.keys : undefined;
    if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
      throw new Error('STYNX JWKS contains no usable verification keys');
    }
    const keys = rawKeys.filter((key): key is Record<string, string | undefined> => this.isUsableKey(key));
    if (keys.length === 0) throw new Error('STYNX JWKS contains no usable verification keys');
    if (!forceRefresh && this.cache?.source === source && this.cache.version > startedAtVersion) {
      return this.cache;
    }
    this.cache = {
      source,
      keys,
      version: ++this.cacheVersion,
      expiresAt: Date.now() + 12 * 60 * 60 * 1000,
    };
    return this.cache;
  }

  private isUsableKey(key: unknown): boolean {
    if (!key || typeof key !== 'object') return false;
    const jwk = key as Record<string, unknown>;
    if (jwk.kty !== 'RSA' || typeof jwk.n !== 'string' || !jwk.n || typeof jwk.e !== 'string' || !jwk.e) return false;
    if (jwk.use !== undefined && jwk.use !== 'sig') return false;
    if (jwk.alg !== undefined && jwk.alg !== 'RS256') return false;
    try {
      createPublicKey({ key: jwk, format: 'jwk' });
      return true;
    } catch {
      return false;
    }
  }
}
