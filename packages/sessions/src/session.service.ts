import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit, Optional } from '@nestjs/common';
import {
  InvalidRefreshTokenError,
  StrongFactorRequiredError,
  RefreshTokenReuseDetectedError,
  SessionExchangeError,
  SessionExpiredError,
} from './errors.js';
import {
  STYNX_SESSION_CLAIMS_RESOLVER,
  STYNX_SESSION_MIRROR,
  STYNX_SESSIONS_OPTIONS,
  STYNX_SESSION_STORE,
} from './tokens.js';
import { SessionJwtSigningService } from './jwt-signing.service.js';
import { SessionRevocationList } from './session-revocation-list.js';
import type {
  DeviceMetadata,
  ResolvedStynxSessionsModuleOptions,
  SessionAuthorizationClaims,
  SessionBundle,
  SessionClaimsResolver,
  SessionCreateMetadata,
  SessionExchangeOptions,
  SessionExchangeResult,
  SessionMirror,
  SessionRecord,
  SessionStatus,
  SessionStore,
} from './types.js';

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
}

function authorizationFields(
  claims: SessionAuthorizationClaims,
): Pick<SessionRecord, 'permissions' | 'roles'> {
  return { permissions: [...claims.permissions], roles: [...claims.roles] };
}

function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

interface RevokedSession {
  record: SessionRecord;
  revokedAt: string;
}

@Injectable()
export class SessionService implements OnModuleInit {
  constructor(
    @Inject(STYNX_SESSIONS_OPTIONS)
    private readonly options: ResolvedStynxSessionsModuleOptions,
    @Inject(STYNX_SESSION_STORE)
    private readonly store: SessionStore,
    private readonly signingService: SessionJwtSigningService,
    @Inject(STYNX_SESSION_MIRROR)
    private readonly mirror: SessionMirror,
    @Optional()
    private readonly revocations?: SessionRevocationList,
    @Optional()
    @Inject(STYNX_SESSION_CLAIMS_RESOLVER)
    private readonly claimsResolver?: SessionClaimsResolver,
  ) {}

  onModuleInit(): void {
    if (!this.store.createWithPolicy) {
      throw new Error(
        'Custom stores must support tenant switching and session policy with atomic SessionStore.createWithPolicy, even when single-session mode is off; see the @stynx-nyx/sessions README section "STYNX 1.5.0 configuration and migration".',
      );
    }
    if (this.options.strongFactor && this.options.strongFactor.acceptedValues.length === 0) {
      throw new Error('Strong-factor policy requires an accepted value');
    }
  }

  async create(
    userId: string,
    tenantId: string,
    cognitoSub: string,
    deviceMeta: DeviceMetadata = {},
    metadata: SessionCreateMetadata = {},
  ): Promise<SessionBundle> {
    const now = this.now();
    const prior = metadata.priorSessionId
      ? await this.store.getSession(metadata.priorSessionId)
      : null;
    if (metadata.priorSessionId && (!prior || prior.userId !== userId)) {
      throw new SessionExchangeError(
        'SESSION_OWNER_MISMATCH',
        'Prior session does not belong to actor',
      );
    }
    if (prior) {
      try {
        this.assertActive(prior, now);
      } catch {
        throw new SessionExchangeError('SESSION_NOT_ACTIVE', 'Prior session is not active');
      }
    }
    let factorVerifiedAt = prior?.strongFactorVerifiedAt;
    if (this.options.strongFactor && !prior) {
      const { claimName, acceptedValues } = this.options.strongFactor;
      const raw = metadata.verifiedFactorClaims?.[claimName];
      const values = typeof raw === 'string' ? raw.split(/[,\s]+/).filter(Boolean) : raw;
      if (
        !Array.isArray(values) ||
        !values.every((value) => typeof value === 'string') ||
        !values.some((value) => {
          const normalized = value.trim().toLowerCase();
          return normalized.length > 0 && acceptedValues.includes(normalized);
        })
      ) {
        throw new StrongFactorRequiredError();
      }
      factorVerifiedAt = now.toISOString();
    }
    if (this.options.strongFactor && !factorVerifiedAt) throw new StrongFactorRequiredError();
    const sid = randomUUID();
    const expiresAt = addSeconds(now, this.options.timeouts.absoluteSeconds).toISOString();
    // Authorization is resolved at mint time, before anything is persisted, so a
    // subject without access in the tenant gets no session (S-12).
    const claims =
      metadata.claims ?? (await this.claimsResolver?.resolve({ sid, userId, tenantId, expiresAt }));
    const permsHash = claims?.permsHash ?? metadata.permsHash;
    const refreshToken = createRefreshToken();
    const idleExpiresAt = minIso(
      addSeconds(now, this.options.timeouts.idleSeconds).toISOString(),
      expiresAt,
    );
    const record: SessionRecord = {
      sid,
      userId,
      tenantId,
      cognitoSub,
      ...(metadata.membershipId !== undefined ? { membershipId: metadata.membershipId } : {}),
      ...(permsHash !== undefined ? { permsHash } : {}),
      ...(claims ? authorizationFields(claims) : {}),
      refreshFamilyId: randomUUID(),
      refreshTokenHash: hashRefreshToken(refreshToken),
      status: 'active',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      lastTouchedAt: now.toISOString(),
      expiresAt,
      idleExpiresAt,
      ...(factorVerifiedAt ? { strongFactorVerifiedAt: factorVerifiedAt } : {}),
      ...(Object.keys(deviceMeta).length > 0 ? { deviceMeta } : {}),
    };

    const mode = this.options.singleSession.mode;
    if ((mode !== 'off' || metadata.priorSessionId) && !this.store.createWithPolicy) {
      throw new Error('Atomic session transition unavailable');
    }
    const revoked =
      mode === 'off' && !metadata.priorSessionId
        ? (await this.store.createSession(record), [])
        : (
            await this.store.createWithPolicy!(record, {
              mode,
              now: now.toISOString(),
              ...(metadata.priorSessionId ? { priorSessionId: metadata.priorSessionId } : {}),
            })
          ).revoked;
    for (const old of revoked) this.revocations?.add(old.sid, now.toISOString());
    for (const scope of new Set(revoked.map((old) => `${old.userId}:${old.tenantId}`))) {
      await this.store.publishInvalidation(scope);
    }
    for (const old of revoked) {
      await this.appendMirror(old, 'revoked', now.toISOString());
    }
    await this.mirror.append({
      sid: record.sid,
      tenantId: record.tenantId,
      userId: record.userId,
      status: 'active',
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });

    const bundle = await this.bundle(record, refreshToken, now);
    return revoked.length
      ? { ...bundle, revokedSessionIds: revoked.map((old) => old.sid) }
      : bundle;
  }

  async refresh(refreshToken: string): Promise<SessionBundle> {
    const now = this.now();
    const refreshHash = hashRefreshToken(refreshToken);
    const lookup = await this.store.lookupRefreshToken(refreshHash);
    if (!lookup) {
      throw new InvalidRefreshTokenError();
    }

    if (lookup.state === 'used') {
      await this.revokeInternal(lookup.sid, 'reuse_detected', undefined);
      throw new RefreshTokenReuseDetectedError(lookup.sid);
    }

    const current = await this.store.getSession(lookup.sid);
    if (!current) {
      throw new InvalidRefreshTokenError();
    }
    this.assertActive(current, now);
    // Re-resolve before rotating: a refreshed token carries current authorization,
    // and a failed resolution leaves the presented refresh token usable.
    const claims = await this.claimsResolver?.resolve({
      sid: current.sid,
      userId: current.userId,
      tenantId: current.tenantId,
      expiresAt: current.expiresAt,
    });

    const nextRefreshToken = createRefreshToken();
    const nextIdleExpiresAt = minIso(
      addSeconds(now, this.options.timeouts.idleSeconds).toISOString(),
      current.expiresAt,
    );
    const rotated = await this.store.rotateRefreshToken(
      current.sid,
      refreshHash,
      hashRefreshToken(nextRefreshToken),
      nextIdleExpiresAt,
      now.toISOString(),
    );
    if (!rotated) {
      throw new InvalidRefreshTokenError();
    }

    const minted = claims
      ? {
          ...rotated,
          ...authorizationFields(claims),
          ...(claims.permsHash !== undefined ? { permsHash: claims.permsHash } : {}),
        }
      : rotated;
    return this.bundle(minted, nextRefreshToken, now);
  }

  async revoke(sid: string): Promise<boolean> {
    const revoked = await this.revokeInternal(
      sid,
      'revoked',
      (record) => `${record.userId}:${record.tenantId}`,
    );
    return revoked !== null;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const sids = await this.store.listSessionIdsByUser(userId);
    const revoked = await Promise.all(sids.map((sid) => this.revokeRecord(sid, 'revoked')));
    const revokedSessions = revoked.filter((entry): entry is RevokedSession => entry !== null);
    const tenantMessages = new Set(
      revokedSessions.map(({ record }) => `${record.userId}:${record.tenantId}`),
    );
    await Promise.all(
      [...tenantMessages].map((message) => this.store.publishInvalidation(message)),
    );
    await Promise.all(
      revokedSessions.map(({ record, revokedAt }) =>
        this.appendMirror(record, 'revoked', revokedAt),
      ),
    );
    return revokedSessions.length;
  }

  async revokeAllForTenant(tenantId: string): Promise<number> {
    const sids = await this.store.listSessionIdsByTenant(tenantId);
    const revoked = await Promise.all(sids.map((sid) => this.revokeRecord(sid, 'revoked')));
    const revokedSessions = revoked.filter((entry): entry is RevokedSession => entry !== null);
    if (revokedSessions.length > 0) {
      await this.store.publishInvalidation(`*:${tenantId}`);
    }
    await Promise.all(
      revokedSessions.map(({ record, revokedAt }) =>
        this.appendMirror(record, 'revoked', revokedAt),
      ),
    );
    return revokedSessions.length;
  }

  async get(sid: string): Promise<SessionRecord | null> {
    const session = await this.store.getSession(sid);
    if (!session) {
      return null;
    }

    try {
      this.assertActive(session, this.now());
      return session;
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        await this.revokeInternal(sid, 'revoked', undefined);
        return null;
      }
      throw error;
    }
  }

  async getActive(sid: string): Promise<SessionRecord | null> {
    const session = await this.store.getSession(sid);
    if (session === null) return null;
    const invalid = (): never => {
      throw new Error('SESSION_RECORD_INVALID');
    };
    if (typeof session !== 'object' || Array.isArray(session)) invalid();
    if (
      session.sid !== sid ||
      ![
        session.userId,
        session.tenantId,
        session.cognitoSub,
        session.refreshFamilyId,
        session.refreshTokenHash,
      ].every((value) => typeof value === 'string' && value.length > 0)
    )
      invalid();
    if (!['active', 'revoked', 'reuse_detected'].includes(session.status)) invalid();
    const instant = (value: unknown): number => {
      if (typeof value !== 'string') return invalid();
      const timestamp = Date.parse(value);
      if (!Number.isFinite(timestamp)) return invalid();
      return timestamp;
    };
    const createdAt = instant(session.createdAt);
    const updatedAt = instant(session.updatedAt);
    const lastTouchedAt = instant(session.lastTouchedAt);
    const expiresAt = instant(session.expiresAt);
    const idleExpiresAt = instant(session.idleExpiresAt);
    if (
      createdAt > lastTouchedAt ||
      lastTouchedAt > updatedAt ||
      createdAt > idleExpiresAt ||
      idleExpiresAt > expiresAt ||
      lastTouchedAt > expiresAt
    )
      invalid();
    if (session.revokedAt !== undefined && instant(session.revokedAt) < createdAt) invalid();
    if (session.strongFactorVerifiedAt !== undefined) instant(session.strongFactorVerifiedAt);
    const now = this.now();
    const nowMillis = now instanceof Date ? now.getTime() : Number.NaN;
    if (!Number.isFinite(nowMillis)) {
      throw new Error('SESSION_CLOCK_INVALID');
    }
    if (session.status !== 'active') return null;
    if (expiresAt <= nowMillis || idleExpiresAt <= nowMillis) {
      await this.revokeInternal(sid, 'revoked', undefined);
      return null;
    }
    return session;
  }

  async touch(sid: string): Promise<SessionRecord | null> {
    const session = await this.get(sid);
    if (!session) {
      return null;
    }

    const touchedAt = this.now().toISOString();
    const idleExpiresAt = minIso(
      addSeconds(new Date(touchedAt), this.options.timeouts.idleSeconds).toISOString(),
      session.expiresAt,
    );
    return this.store.touchSession(sid, idleExpiresAt, touchedAt);
  }

  async exchange(options: SessionExchangeOptions): Promise<SessionExchangeResult> {
    const current = await this.store.getSession(options.sessionId);
    if (!current) {
      throw new SessionExchangeError('SESSION_NOT_FOUND', `Session ${options.sessionId} not found`);
    }
    if (current.userId !== options.actorUserId) {
      throw new SessionExchangeError(
        'SESSION_OWNER_MISMATCH',
        `Session ${options.sessionId} does not belong to user ${options.actorUserId}`,
      );
    }

    try {
      this.assertActive(current, this.now());
    } catch {
      throw new SessionExchangeError(
        'SESSION_NOT_ACTIVE',
        `Session ${options.sessionId} is no longer active`,
      );
    }

    const bundle = await this.create(
      options.actorUserId,
      options.newTenantId,
      current.cognitoSub,
      options.deviceMeta ?? current.deviceMeta ?? {},
      {
        ...(options.membershipId !== undefined ? { membershipId: options.membershipId } : {}),
        ...(options.permsHash !== undefined ? { permsHash: options.permsHash } : {}),
        priorSessionId: options.sessionId,
      },
    );

    return { bundle, revokedSessionId: options.sessionId };
  }

  private async bundle(
    record: SessionRecord,
    refreshToken: string,
    now: Date,
  ): Promise<SessionBundle> {
    const accessToken = await this.signingService.signAccessToken(record, now);
    return {
      sid: record.sid,
      accessToken: accessToken.token,
      accessTokenExpiresAt: accessToken.expiresAt,
      refreshToken,
      expiresAt: record.expiresAt,
      idleExpiresAt: record.idleExpiresAt,
    };
  }

  private assertActive(record: SessionRecord, now: Date): void {
    if (record.status !== 'active') {
      throw new InvalidRefreshTokenError();
    }
    const nowMs = now.getTime();
    if (
      new Date(record.expiresAt).getTime() <= nowMs ||
      new Date(record.idleExpiresAt).getTime() <= nowMs
    ) {
      throw new SessionExpiredError(record.sid);
    }
  }

  private async revokeInternal(
    sid: string,
    status: SessionStatus,
    publishMessage: ((record: SessionRecord) => string) | undefined,
  ): Promise<SessionRecord | null> {
    const revokedSession = await this.revokeRecord(sid, status);
    if (!revokedSession) {
      return null;
    }

    const { record, revokedAt } = revokedSession;

    await this.mirror.append({
      sid: record.sid,
      tenantId: record.tenantId,
      userId: record.userId,
      ...(record.membershipId !== undefined ? { membershipId: record.membershipId } : {}),
      status,
      expiresAt: record.expiresAt,
      createdAt: revokedAt,
    });

    if (publishMessage) {
      await this.store.publishInvalidation(publishMessage(record));
    }

    return record;
  }

  private async revokeRecord(sid: string, status: SessionStatus): Promise<RevokedSession | null> {
    const revokedAt = this.now().toISOString();
    const record = await this.store.revokeSession(sid, revokedAt, status);
    if (!record) {
      return null;
    }
    this.revocations?.add(sid, revokedAt);
    return { record, revokedAt };
  }

  private async appendMirror(
    record: SessionRecord,
    status: SessionStatus,
    createdAt: string,
  ): Promise<void> {
    await this.mirror.append({
      sid: record.sid,
      tenantId: record.tenantId,
      userId: record.userId,
      ...(record.membershipId !== undefined ? { membershipId: record.membershipId } : {}),
      status,
      expiresAt: record.expiresAt,
      createdAt,
    });
  }

  private now(): Date {
    return this.options.clock();
  }
}
