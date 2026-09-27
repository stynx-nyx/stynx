import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  InvalidRefreshTokenError,
  StrongFactorRequiredError,
  RefreshTokenReuseDetectedError,
  SessionExchangeError,
  SessionExpiredError,
} from './errors';
import { STYNX_SESSION_MIRROR, STYNX_SESSIONS_OPTIONS, STYNX_SESSION_STORE } from './tokens';
import { SessionJwtSigningService } from './jwt-signing.service';
import type {
  DeviceMetadata,
  ResolvedStynxSessionsModuleOptions,
  SessionBundle,
  SessionCreateMetadata,
  SessionExchangeOptions,
  SessionExchangeResult,
  SessionMirror,
  SessionRecord,
  SessionStatus,
  SessionStore,
} from './types';

function addSeconds(date: Date, seconds: number): Date {
  return new Date(date.getTime() + seconds * 1000);
}

function minIso(a: string, b: string): string {
  return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
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
  ) {}

  onModuleInit(): void {
    if (!this.store.createWithPolicy) {
      throw new Error('Custom stores must support tenant switching and session policy with atomic SessionStore.createWithPolicy, even when single-session mode is off; see the @stynx-nyx/sessions README section "STYNX 1.5.0 configuration and migration".');
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
    const prior = metadata.priorSessionId ? await this.store.getSession(metadata.priorSessionId) : null;
    if (metadata.priorSessionId && (!prior || prior.userId !== userId)) {
      throw new SessionExchangeError('SESSION_OWNER_MISMATCH', 'Prior session does not belong to actor');
    }
    if (prior) {
      try { this.assertActive(prior, now); } catch {
        throw new SessionExchangeError('SESSION_NOT_ACTIVE', 'Prior session is not active');
      }
    }
    let factorVerifiedAt = prior?.strongFactorVerifiedAt;
    if (this.options.strongFactor && !prior) {
      const { claimName, acceptedValues } = this.options.strongFactor;
      const raw = metadata.verifiedFactorClaims?.[claimName];
      const values = typeof raw === 'string' ? raw.split(/[,\s]+/).filter(Boolean) : raw;
      if (!Array.isArray(values) || !values.every((value) => typeof value === 'string')
        || !values.some((value) => {
          const normalized = value.trim().toLowerCase();
          return normalized.length > 0 && acceptedValues.includes(normalized);
        })) {
        throw new StrongFactorRequiredError();
      }
      factorVerifiedAt = now.toISOString();
    }
    if (this.options.strongFactor && !factorVerifiedAt) throw new StrongFactorRequiredError();
    const refreshToken = createRefreshToken();
    const expiresAt = addSeconds(now, this.options.timeouts.absoluteSeconds).toISOString();
    const idleExpiresAt = minIso(
      addSeconds(now, this.options.timeouts.idleSeconds).toISOString(),
      expiresAt,
    );
    const record: SessionRecord = {
      sid: randomUUID(),
      userId,
      tenantId,
      cognitoSub,
      ...(metadata.membershipId !== undefined ? { membershipId: metadata.membershipId } : {}),
      ...(metadata.permsHash !== undefined ? { permsHash: metadata.permsHash } : {}),
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
    const revoked = mode === 'off' && !metadata.priorSessionId
      ? (await this.store.createSession(record), [])
      : (await this.store.createWithPolicy!(record, {
        mode,
        now: now.toISOString(),
        ...(metadata.priorSessionId ? { priorSessionId: metadata.priorSessionId } : {}),
      })).revoked;
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
    return revoked.length ? { ...bundle, revokedSessionIds: revoked.map((old) => old.sid) } : bundle;
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

    return this.bundle(rotated, nextRefreshToken, now);
  }

  async revoke(sid: string): Promise<boolean> {
    const revoked = await this.revokeInternal(sid, 'revoked', (record) => `${record.userId}:${record.tenantId}`);
    return revoked !== null;
  }

  async revokeAllForUser(userId: string): Promise<number> {
    const sids = await this.store.listSessionIdsByUser(userId);
    const revoked = await Promise.all(
      sids.map((sid) => this.revokeRecord(sid, 'revoked')),
    );
    const revokedSessions = revoked.filter((entry): entry is RevokedSession => entry !== null);
    const tenantMessages = new Set(
      revokedSessions.map(({ record }) => `${record.userId}:${record.tenantId}`),
    );
    await Promise.all([...tenantMessages].map((message) => this.store.publishInvalidation(message)));
    await Promise.all(
      revokedSessions.map(({ record, revokedAt }) => this.appendMirror(record, 'revoked', revokedAt)),
    );
    return revokedSessions.length;
  }

  async revokeAllForTenant(tenantId: string): Promise<number> {
    const sids = await this.store.listSessionIdsByTenant(tenantId);
    const revoked = await Promise.all(
      sids.map((sid) => this.revokeRecord(sid, 'revoked')),
    );
    const revokedSessions = revoked.filter((entry): entry is RevokedSession => entry !== null);
    if (revokedSessions.length > 0) {
      await this.store.publishInvalidation(`*:${tenantId}`);
    }
    await Promise.all(
      revokedSessions.map(({ record, revokedAt }) => this.appendMirror(record, 'revoked', revokedAt)),
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
      throw new SessionExchangeError(
        'SESSION_NOT_FOUND',
        `Session ${options.sessionId} not found`,
      );
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
      new Date(record.expiresAt).getTime() <= nowMs
      || new Date(record.idleExpiresAt).getTime() <= nowMs
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
    return { record, revokedAt };
  }

  private async appendMirror(record: SessionRecord, status: SessionStatus, createdAt: string): Promise<void> {
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
