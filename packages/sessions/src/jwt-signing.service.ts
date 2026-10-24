import { createPrivateKey, createPublicKey, randomUUID, sign as signJwtData, type KeyObject } from 'node:crypto';
import { SecretLoader } from '@stynx-nyx/core';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { SessionSigningKeyError } from './errors.js';
import { STYNX_SESSIONS_OPTIONS } from './tokens.js';
import type {
  IssuedAccessToken,
  ResolvedStynxSessionsModuleOptions,
  SessionRecord,
  StynxSessionSigningKeySet,
} from './types.js';

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

  if (!('currentKid' in value) || typeof value.currentKid !== 'string' || value.currentKid.length === 0) {
    throw new SessionSigningKeyError('Session key material is missing currentKid');
  }
  if (!('keys' in value) || !Array.isArray(value.keys) || value.keys.length === 0) {
    throw new SessionSigningKeyError('Session key material has no keys');
  }

  return {
    currentKid: value.currentKid,
    keys: value.keys.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object') {
        throw new SessionSigningKeyError('Session signing key entry is invalid');
      }
      if (
        !('kid' in entry) || typeof entry.kid !== 'string'
        || !('publicKeyPem' in entry) || typeof entry.publicKeyPem !== 'string'
        || !('privateKeyPem' in entry) || typeof entry.privateKeyPem !== 'string'
      ) {
        throw new SessionSigningKeyError('Session signing key entry is incomplete');
      }
      return {
        kid: entry.kid,
        publicKeyPem: entry.publicKeyPem,
        privateKeyPem: entry.privateKeyPem,
        ...('activatesAt' in entry && typeof entry.activatesAt === 'string' ? { activatesAt: entry.activatesAt } : {}),
        ...('expiresAt' in entry && typeof entry.expiresAt === 'string' ? { expiresAt: entry.expiresAt } : {}),
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
    // A token never outlives its session's absolute or idle deadline as of issuance:
    // with no per-request session read (S-12), `exp` is what enforces them.
    const sessionDeadlines = [record.expiresAt, record.idleExpiresAt]
      .map((deadline) => Math.floor(Date.parse(String(deadline)) / 1000))
      .filter((deadline) => Number.isFinite(deadline));
    const expiresAtSeconds = Math.min(
      issuedAtSeconds + this.options.timeouts.accessSeconds,
      ...sessionDeadlines,
    );
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
      // S-12: authorization travels in the verified token. A record without
      // resolved permissions mints no `perms` claim, and the STYNX guard denies it.
      ...(record.permissions
        ? { perms: [...record.permissions], roles: [...(record.roles ?? [])] }
        : {}),
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
      const exported = publicKey.export({ format: 'jwk' });
      const jwk: Record<string, string | undefined> = {};
      for (const [name, value] of Object.entries(exported)) {
        if (value !== undefined && typeof value !== 'string') {
          throw new SessionSigningKeyError('Session public key contains unsupported JWK metadata');
        }
        jwk[name] = value;
      }
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
    const parsed: unknown = JSON.parse(raw);
    return validateKeySet(parsed);
  }
}
