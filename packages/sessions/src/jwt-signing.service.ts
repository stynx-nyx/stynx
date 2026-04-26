import { createPrivateKey, createPublicKey, randomUUID, sign as signJwtData, type KeyObject } from 'node:crypto';
import { SecretLoader } from '@stynx/core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { SessionSigningKeyError } from './errors';
import { STYNX_SESSIONS_OPTIONS } from './tokens';
import type {
  IssuedAccessToken,
  ResolvedStynxSessionsModuleOptions,
  SessionRecord,
  StynxSessionSigningKeySet,
} from './types';

interface ResolvedSigningKey {
  kid: string;
  privateKey: KeyObject;
  jwk: Record<string, string | undefined> & { kid: string; use: 'sig'; alg: 'RS256' };
}

interface CachedSigningKeys {
  expiresAt: number;
  activeKid: string;
  keys: ResolvedSigningKey[];
}

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/u, '');
}

function validateKeySet(value: unknown): StynxSessionSigningKeySet {
  if (!value || typeof value !== 'object') {
    throw new SessionSigningKeyError('Session key material is missing');
  }

  const parsed = value as {
    currentKid?: unknown;
    keys?: unknown;
  };

  if (typeof parsed.currentKid !== 'string' || parsed.currentKid.length === 0) {
    throw new SessionSigningKeyError('Session key material is missing currentKid');
  }
  if (!Array.isArray(parsed.keys) || parsed.keys.length === 0) {
    throw new SessionSigningKeyError('Session key material has no keys');
  }

  return {
    currentKid: parsed.currentKid,
    keys: parsed.keys.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        throw new SessionSigningKeyError('Session signing key entry is invalid');
      }
      const key = entry as {
        kid?: unknown;
        publicKeyPem?: unknown;
        privateKeyPem?: unknown;
        activatesAt?: unknown;
        expiresAt?: unknown;
      };
      if (
        typeof key.kid !== 'string'
        || typeof key.publicKeyPem !== 'string'
        || typeof key.privateKeyPem !== 'string'
      ) {
        throw new SessionSigningKeyError('Session signing key entry is incomplete');
      }
      return {
        kid: key.kid,
        publicKeyPem: key.publicKeyPem,
        privateKeyPem: key.privateKeyPem,
        ...(typeof key.activatesAt === 'string' ? { activatesAt: key.activatesAt } : {}),
        ...(typeof key.expiresAt === 'string' ? { expiresAt: key.expiresAt } : {}),
      };
    }),
  };
}

@Injectable()
export class SessionJwtSigningService {
  private cache?: CachedSigningKeys;

  constructor(
    @Inject(STYNX_SESSIONS_OPTIONS)
    private readonly options: ResolvedStynxSessionsModuleOptions,
    @Optional()
    private readonly secretLoader?: SecretLoader,
  ) {}

  async signAccessToken(record: SessionRecord, issuedAt: Date): Promise<IssuedAccessToken> {
    const keys = await this.resolveSigningKeys();
    const active = keys.keys.find((entry) => entry.kid === keys.activeKid);
    if (!active) {
      throw new SessionSigningKeyError(`Active session signing key ${keys.activeKid} not found`);
    }

    const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
    const expiresAtSeconds = issuedAtSeconds + this.options.timeouts.accessSeconds;
    const notBeforeSeconds =
      issuedAtSeconds + this.options.timeouts.accessNotBeforeDelaySeconds;
    const header = {
      alg: 'RS256',
      kid: active.kid,
      typ: 'JWT',
    };
    const payload = {
      iss: this.options.issuer,
      sub: record.userId,
      sid: record.sid,
      tenant_id: record.tenantId,
      cognito_sub: record.cognitoSub,
      ...(record.permsHash ? { perms_hash: record.permsHash } : {}),
      amr: ['refresh'],
      iat: issuedAtSeconds,
      exp: expiresAtSeconds,
      nbf: notBeforeSeconds,
      jti: randomUUID(),
      ...(this.options.audience ? { aud: this.options.audience } : {}),
    };
    const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
    const signature = signJwtData('RSA-SHA256', Buffer.from(signingInput), active.privateKey);

    return {
      token: `${signingInput}.${base64UrlEncode(signature)}`,
      expiresAt: new Date(expiresAtSeconds * 1000).toISOString(),
    };
  }

  async getJwks(): Promise<{ keys: Array<Record<string, string | undefined> & { kid: string; use: 'sig'; alg: 'RS256' }> }> {
    const keys = await this.resolveSigningKeys();
    return {
      keys: keys.keys.map((entry) => ({ ...entry.jwk })),
    };
  }

  private async resolveSigningKeys(): Promise<CachedSigningKeys> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache;
    }

    const keySet = await this.loadKeySet();
    const resolvedKeys = keySet.keys.map((entry) => {
      const privateKey = createPrivateKey(entry.privateKeyPem);
      const publicKey = createPublicKey(entry.publicKeyPem);
      const jwk = publicKey.export({ format: 'jwk' }) as Record<string, string | undefined>;
      return {
        kid: entry.kid,
        privateKey,
        jwk: {
          ...jwk,
          kid: entry.kid,
          use: 'sig',
          alg: 'RS256',
        },
      } satisfies ResolvedSigningKey;
    });

    this.cache = {
      activeKid: keySet.currentKid,
      keys: resolvedKeys,
      expiresAt: now + this.options.jwt.cacheTtlMs,
    };
    return this.cache;
  }

  private async loadKeySet(): Promise<StynxSessionSigningKeySet> {
    if (this.options.jwt.keySet) {
      return this.options.jwt.keySet;
    }
    if (!this.options.jwt.secretId) {
      throw new SessionSigningKeyError('Session signing requires jwt.keySet or jwt.secretId');
    }
    if (!this.secretLoader) {
      throw new SessionSigningKeyError('SecretLoader is unavailable for session signing');
    }

    const raw = await this.secretLoader.getSecretString(this.options.jwt.secretId);
    return validateKeySet(JSON.parse(raw) as unknown);
  }
}
