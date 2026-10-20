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
  /** Effective permission keys minted into the access token `perms` claim (S-12). */
  permissions?: string[];
  /** Role keys minted into the access token `roles` claim (S-12). */
  roles?: string[];
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
  strongFactorVerifiedAt?: string;
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
  revokedSessionIds?: string[];
  accessToken: string;
  accessTokenExpiresAt: string;
  refreshToken: string;
  expiresAt: string;
  idleExpiresAt: string;
}

export interface SessionCreateMetadata {
  membershipId?: string;
  permsHash?: string;
  /**
   * Authorization claims to mint into the access token. When omitted, the
   * registered {@link SessionClaimsResolver} supplies them.
   */
  claims?: SessionAuthorizationClaims;
  verifiedFactorClaims?: Record<string, unknown>;
  priorSessionId?: string;
}

export type SingleSessionMode = 'off' | 'revoke-existing' | 'reject-new';
export interface SessionPolicyResult {
  created: SessionRecord;
  revoked: SessionRecord[];
}
export interface SessionPolicyOptions {
  mode: SingleSessionMode;
  now: string;
  priorSessionId?: string;
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

/**
 * Authorization carried by a STYNX access token. The request path reads these
 * from the verified token only (S-12); nothing is looked up per request.
 */
export interface SessionAuthorizationClaims {
  permissions: string[];
  roles: string[];
  permsHash?: string;
}

/** Subject whose authorization claims are resolved at token mint time. */
export interface SessionClaimsSubject {
  sid: string;
  userId: string;
  tenantId: string;
  /** The session's absolute expiry (ISO instant). */
  expiresAt: string;
}

/**
 * Resolves the authorization claims minted into access tokens on session
 * creation and refresh. Runs on token issuance only, never on the request path.
 */
export interface SessionClaimsResolver {
  resolve(subject: SessionClaimsSubject): Promise<SessionAuthorizationClaims>;
}

/** One revoked session id, as listed by {@link SessionStore.listRevokedSessions}. */
export interface SessionRevocationEntry {
  sid: string;
  revokedAt: string;
}

export interface SessionStore {
  createSession(record: SessionRecord): Promise<void>;
  createWithPolicy?(record: SessionRecord, options: SessionPolicyOptions): Promise<SessionPolicyResult>;
  probeReadiness?(): Promise<boolean>;
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
  /**
   * Lists sessions revoked at or after `since` (ISO instant) and may drop older
   * entries. The revocation refresher calls it in the background; stores that do
   * not implement it leave revocation to in-process records and the token TTL.
   */
  listRevokedSessions?(since: string): Promise<SessionRevocationEntry[]>;
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
  singleSession?: { mode: SingleSessionMode };
  strongFactor?: { claimName?: string; acceptedValues: string[] };
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
  /** Background refresh of the in-memory session revocation list. */
  revocation?: {
    /** Interval between background refreshes. Defaults to 1000 ms. */
    refreshIntervalMs?: number;
    /** Age after which an unrefreshed list fails closed. Defaults to 15000 ms. */
    maxStalenessMs?: number;
  };
  clock?: () => Date;
}

export interface ResolvedStynxSessionsModuleOptions {
  singleSession: { mode: SingleSessionMode };
  strongFactor?: { claimName: string; acceptedValues: string[] };
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
  /** Optional so hand-built resolved options stay valid; the resolver always sets it. */
  revocation?: {
    refreshIntervalMs: number;
    maxStalenessMs: number;
  };
  clock: () => Date;
}

export function resolveSessionsOptions(
  options: StynxSessionsModuleOptions,
): ResolvedStynxSessionsModuleOptions {
  return {
    singleSession: { mode: options.singleSession?.mode ?? 'off' },
    ...(options.strongFactor ? { strongFactor: {
      claimName: options.strongFactor.claimName ?? 'amr',
      acceptedValues: options.strongFactor.acceptedValues
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    } } : {}),
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
    revocation: {
      refreshIntervalMs: options.revocation?.refreshIntervalMs ?? 1000,
      maxStalenessMs: options.revocation?.maxStalenessMs ?? 15_000,
    },
    clock: options.clock ?? (() => new Date()),
  };
}
