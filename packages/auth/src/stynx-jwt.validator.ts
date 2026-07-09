import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SessionJwtSigningService } from '@stynx-nyx/sessions';
import { STYNX_AUTH_OPTIONS } from './tokens';
import type { ResolvedStynxAuthModuleOptions, StynxAccessTokenClaims } from './types';
import { verifyJwtWithJwk } from './utils';

interface CachedKeySet {
  expiresAt: number;
  keys: Array<Record<string, string | undefined> & { kid: string }>;
}

@Injectable()
export class StynxJwtValidator {
  private cache?: CachedKeySet;

  constructor(
    private readonly moduleRef: ModuleRef,
    @Inject(STYNX_AUTH_OPTIONS)
    private readonly options: ResolvedStynxAuthModuleOptions,
  ) {}

  async validate(token: string): Promise<StynxAccessTokenClaims> {
    const signingService = this.moduleRef.get(SessionJwtSigningService, { strict: false });
    try {
      return await this.verify(token, false, signingService);
    } catch (error) {
      if (!signingService) {
        throw error;
      }
      return this.verify(token, true, signingService);
    }
  }

  private async verify(
    token: string,
    forceRefresh: boolean,
    signingService?: SessionJwtSigningService,
  ): Promise<StynxAccessTokenClaims> {
    const decoded = await this.resolveKeys(forceRefresh, signingService);
    const payload = decoded.keys
      .map((key) => {
        try {
          return verifyJwtWithJwk(token, key as Record<string, string | undefined>);
        } catch {
          return null;
        }
      })
      .find((value): value is Record<string, unknown> => value !== null);

    if (!payload) {
      throw new Error('STYNX access token verification failed');
    }
    if (payload.iss !== this.options.stynx.issuer) {
      throw new Error('STYNX token issuer mismatch');
    }
    if (this.options.stynx.audience && payload.aud !== this.options.stynx.audience) {
      throw new Error('STYNX token audience mismatch');
    }

    const nowSeconds = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
      throw new Error('STYNX token expired');
    }
    if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds + 5) {
      throw new Error('STYNX token not active yet');
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

  private async resolveKeys(
    forceRefresh: boolean,
    signingService?: SessionJwtSigningService,
  ): Promise<CachedKeySet> {
    const now = Date.now();
    if (!forceRefresh && this.cache && this.cache.expiresAt > now) {
      return this.cache;
    }

    if (signingService) {
      const jwks = await signingService.getJwks();
      this.cache = {
        keys: jwks.keys as Array<Record<string, string | undefined> & { kid: string }>,
        expiresAt: now + 12 * 60 * 60 * 1000,
      };
      return this.cache;
    }

    if (!this.options.stynx.jwksUri) {
      throw new Error('No STYNX JWKS source configured');
    }

    const response = await fetch(this.options.stynx.jwksUri);
    if (!response.ok) {
      throw new Error(`Failed to load STYNX JWKS: ${response.status}`);
    }
    const jwks = await response.json() as { keys: Array<Record<string, string | undefined> & { kid: string }> };
    this.cache = {
      keys: jwks.keys,
      expiresAt: now + 12 * 60 * 60 * 1000,
    };
    return this.cache;
  }
}
