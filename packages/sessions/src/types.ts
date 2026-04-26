export type SessionStatus = 'active' | 'revoked' | 'reuse_detected';

export interface DeviceMetadata {
  [key: string]: unknown;
}

export interface SessionRecord {
  sid: string;
  userId: string;
  tenantId: string;
  cognitoSub: string;
  membershipId?: string;
  permsHash?: string;
  deviceMeta?: DeviceMetadata;
  refreshFamilyId: string;
  refreshTokenHash: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  lastTouchedAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  revokedAt?: string;
}

export interface RefreshTokenLookup {
  sid: string;
  familyId: string;
  state: 'active' | 'used';
}

export interface SessionMirrorEntry {
  sid: string;
  tenantId: string;
  userId: string;
  membershipId?: string;
  status: SessionStatus;
  expiresAt: string;
  createdAt: string;
}

export interface IssuedAccessToken {
  token: string;
  expiresAt: string;
}

export interface SessionBundle {
  sid: string;
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  expiresAt: string;
  idleExpiresAt: string;
}

export interface SessionCreateMetadata {
  membershipId?: string;
  permsHash?: string;
}

export interface SessionExchangeOptions {
  /** The session being replaced. Must be active and belong to `actorUserId`. */
  sessionId: string;
  /** The tenant the new session should be scoped to. */
  newTenantId: string;
  /** The user performing the exchange. Must match the originating session. */
  actorUserId: string;
  /** Optional membership ID in the new tenant. */
  membershipId?: string;
  /** Optional device metadata to carry over or override. */
  deviceMeta?: DeviceMetadata;
  /** Optional permissions hash for the new tenant context. */
  permsHash?: string;
}

export interface SessionExchangeResult {
  /** The new session bundle issued for the target tenant. */
  bundle: SessionBundle;
  /** The session ID that was revoked. */
  revokedSessionId: string;
}

export interface SessionStore {
  createSession(record: SessionRecord): Promise<void>;
  getSession(sid: string): Promise<SessionRecord | null>;
  lookupRefreshToken(hash: string): Promise<RefreshTokenLookup | null>;
  rotateRefreshToken(
    sid: string,
    currentHash: string,
    nextHash: string,
    idleExpiresAt: string,
    touchedAt: string,
  ): Promise<SessionRecord | null>;
  touchSession(sid: string, idleExpiresAt: string, touchedAt: string): Promise<SessionRecord | null>;
  revokeSession(sid: string, revokedAt: string, status: SessionStatus): Promise<SessionRecord | null>;
  listSessionIdsByUser(userId: string): Promise<string[]>;
  listSessionIdsByTenant(tenantId: string): Promise<string[]>;
  publishInvalidation(message: string): Promise<void>;
}

export interface SessionMirror {
  append(entry: SessionMirrorEntry): Promise<void>;
}

export interface StynxSessionSigningKey {
  kid: string;
  publicKeyPem: string;
  privateKeyPem: string;
  activatesAt?: string;
  expiresAt?: string;
}

export interface StynxSessionSigningKeySet {
  currentKid: string;
  keys: StynxSessionSigningKey[];
}

export interface StynxSessionsModuleOptions {
  issuer: string;
  audience?: string;
  redis: {
    url: string;
    keyPrefix?: string;
    invalidateChannel?: string;
  };
  jwt: {
    keySet?: StynxSessionSigningKeySet;
    secretId?: string;
    cacheTtlMs?: number;
  };
  timeouts?: {
    accessSeconds?: number;
    absoluteSeconds?: number;
    idleSeconds?: number;
    accessNotBeforeDelaySeconds?: number;
  };
  clock?: () => Date;
}

export interface ResolvedStynxSessionsModuleOptions {
  issuer: string;
  audience?: string;
  redis: {
    url: string;
    keyPrefix: string;
    invalidateChannel: string;
  };
  jwt: {
    keySet?: StynxSessionSigningKeySet;
    secretId?: string;
    cacheTtlMs: number;
  };
  timeouts: {
    accessSeconds: number;
    absoluteSeconds: number;
    idleSeconds: number;
    accessNotBeforeDelaySeconds: number;
  };
  clock: () => Date;
}

export function resolveSessionsOptions(
  options: StynxSessionsModuleOptions,
): ResolvedStynxSessionsModuleOptions {
  return {
    issuer: options.issuer,
    ...(options.audience !== undefined ? { audience: options.audience } : {}),
    redis: {
      url: options.redis.url,
      keyPrefix: options.redis.keyPrefix ?? 'stynx:sessions',
      invalidateChannel: options.redis.invalidateChannel ?? 'perms:invalidate',
    },
    jwt: {
      ...(options.jwt.keySet !== undefined ? { keySet: options.jwt.keySet } : {}),
      ...(options.jwt.secretId !== undefined ? { secretId: options.jwt.secretId } : {}),
      cacheTtlMs: options.jwt.cacheTtlMs ?? 5 * 60 * 1000,
    },
    timeouts: {
      accessSeconds: options.timeouts?.accessSeconds ?? 10 * 60,
      absoluteSeconds: options.timeouts?.absoluteSeconds ?? 24 * 60 * 60,
      idleSeconds: options.timeouts?.idleSeconds ?? 30 * 60,
      accessNotBeforeDelaySeconds: options.timeouts?.accessNotBeforeDelaySeconds ?? 0,
    },
    clock: options.clock ?? (() => new Date()),
  };
}
