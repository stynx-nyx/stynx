import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  InvalidRefreshTokenError,
  RefreshTokenReuseDetectedError,
  SessionExpiredError,
} from './errors';
import { STYNX_SESSION_MIRROR, STYNX_SESSIONS_OPTIONS, STYNX_SESSION_STORE } from './tokens';
import { SessionJwtSigningService } from './jwt-signing.service';
import type {
  DeviceMetadata,
  ResolvedStynxSessionsModuleOptions,
  SessionBundle,
  SessionCreateMetadata,
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

@Injectable()
export class SessionService {
  constructor(
    @Inject(STYNX_SESSIONS_OPTIONS)
    private readonly options: ResolvedStynxSessionsModuleOptions,
    @Inject(STYNX_SESSION_STORE)
    private readonly store: SessionStore,
    private readonly signingService: SessionJwtSigningService,
    @Inject(STYNX_SESSION_MIRROR)
    private readonly mirror: SessionMirror,
  ) {}

  async create(
    userId: string,
    tenantId: string,
    cognitoSub: string,
    deviceMeta: DeviceMetadata = {},
    metadata: SessionCreateMetadata = {},
  ): Promise<SessionBundle> {
    const now = this.now();
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
      ...(Object.keys(deviceMeta).length > 0 ? { deviceMeta } : {}),
    };

    await this.store.createSession(record);
    await this.mirror.append({
      sid: record.sid,
      tenantId: record.tenantId,
      userId: record.userId,
      status: 'active',
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });

    return this.bundle(record, refreshToken, now);
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
      sids.map((sid) => this.revokeInternal(sid, 'revoked', undefined)),
    );
    const tenantMessages = new Set(
      revoked
        .filter((record): record is SessionRecord => record !== null)
        .map((record) => `${record.userId}:${record.tenantId}`),
    );
    await Promise.all([...tenantMessages].map((message) => this.store.publishInvalidation(message)));
    return revoked.filter((record) => record !== null).length;
  }

  async revokeAllForTenant(tenantId: string): Promise<number> {
    const sids = await this.store.listSessionIdsByTenant(tenantId);
    const revoked = await Promise.all(
      sids.map((sid) => this.revokeInternal(sid, 'revoked', undefined)),
    );
    if (revoked.some((record) => record !== null)) {
      await this.store.publishInvalidation(`*:${tenantId}`);
    }
    return revoked.filter((record) => record !== null).length;
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
    const revokedAt = this.now().toISOString();
    const revoked = await this.store.revokeSession(sid, revokedAt, status);
    if (!revoked) {
      return null;
    }

    await this.mirror.append({
      sid: revoked.sid,
      tenantId: revoked.tenantId,
      userId: revoked.userId,
      ...(revoked.membershipId !== undefined ? { membershipId: revoked.membershipId } : {}),
      status,
      expiresAt: revoked.expiresAt,
      createdAt: revokedAt,
    });

    if (publishMessage) {
      await this.store.publishInvalidation(publishMessage(revoked));
    }

    return revoked;
  }

  private now(): Date {
    return this.options.clock();
  }
}
