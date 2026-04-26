import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createClient } from 'redis';
import { STYNX_SESSIONS_OPTIONS } from './tokens';
import type {
  RefreshTokenLookup,
  ResolvedStynxSessionsModuleOptions,
  SessionRecord,
  SessionStatus,
  SessionStore,
} from './types';

function unixSeconds(isoTimestamp: string): number {
  return Math.ceil(new Date(isoTimestamp).getTime() / 1000);
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
}

@Injectable()
export class RedisSessionStore implements SessionStore, OnModuleInit, OnModuleDestroy {
  private client?: ReturnType<typeof createClient>;

  constructor(
    @Inject(STYNX_SESSIONS_OPTIONS)
    private readonly options: ResolvedStynxSessionsModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    const client = createClient({ url: this.options.redis.url });
    client.on('error', () => undefined);
    await client.connect();
    this.client = client;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async createSession(record: SessionRecord): Promise<void> {
    const client = this.getClient();
    const multi = client.multi();
    multi.set(this.sessionKey(record.sid), JSON.stringify(record));
    multi.expireAt(this.sessionKey(record.sid), unixSeconds(record.expiresAt));
    multi.sAdd(this.userIndexKey(record.userId), record.sid);
    multi.sAdd(this.tenantIndexKey(record.tenantId), record.sid);
    multi.set(this.refreshLookupKey(record.refreshTokenHash), JSON.stringify({
      sid: record.sid,
      familyId: record.refreshFamilyId,
      state: 'active',
    } satisfies RefreshTokenLookup));
    multi.expireAt(this.refreshLookupKey(record.refreshTokenHash), unixSeconds(record.expiresAt));
    await multi.exec();
  }

  async getSession(sid: string): Promise<SessionRecord | null> {
    return parseJson<SessionRecord>(await this.getClient().get(this.sessionKey(sid)));
  }

  async lookupRefreshToken(hash: string): Promise<RefreshTokenLookup | null> {
    return parseJson<RefreshTokenLookup>(await this.getClient().get(this.refreshLookupKey(hash)));
  }

  async rotateRefreshToken(
    sid: string,
    currentHash: string,
    nextHash: string,
    idleExpiresAt: string,
    touchedAt: string,
  ): Promise<SessionRecord | null> {
    const current = await this.getSession(sid);
    const lookup = await this.lookupRefreshToken(currentHash);
    if (!current || !lookup || lookup.state !== 'active' || current.refreshTokenHash !== currentHash) {
      return null;
    }

    const updated: SessionRecord = {
      ...current,
      refreshTokenHash: nextHash,
      idleExpiresAt,
      lastTouchedAt: touchedAt,
      updatedAt: touchedAt,
    };

    const client = this.getClient();
    const multi = client.multi();
    multi.set(this.sessionKey(sid), JSON.stringify(updated));
    multi.expireAt(this.sessionKey(sid), unixSeconds(updated.expiresAt));
    multi.set(this.refreshLookupKey(currentHash), JSON.stringify({
      sid,
      familyId: current.refreshFamilyId,
      state: 'used',
    } satisfies RefreshTokenLookup));
    multi.expireAt(this.refreshLookupKey(currentHash), unixSeconds(updated.expiresAt));
    multi.set(this.refreshLookupKey(nextHash), JSON.stringify({
      sid,
      familyId: current.refreshFamilyId,
      state: 'active',
    } satisfies RefreshTokenLookup));
    multi.expireAt(this.refreshLookupKey(nextHash), unixSeconds(updated.expiresAt));
    await multi.exec();

    return updated;
  }

  async touchSession(
    sid: string,
    idleExpiresAt: string,
    touchedAt: string,
  ): Promise<SessionRecord | null> {
    const current = await this.getSession(sid);
    if (!current) {
      return null;
    }

    const updated: SessionRecord = {
      ...current,
      idleExpiresAt,
      lastTouchedAt: touchedAt,
      updatedAt: touchedAt,
    };
    const client = this.getClient();
    const multi = client.multi();
    multi.set(this.sessionKey(sid), JSON.stringify(updated));
    multi.expireAt(this.sessionKey(sid), unixSeconds(updated.expiresAt));
    await multi.exec();
    return updated;
  }

  async revokeSession(
    sid: string,
    revokedAt: string,
    status: SessionStatus,
  ): Promise<SessionRecord | null> {
    const current = await this.getSession(sid);
    if (!current) {
      return null;
    }

    const client = this.getClient();
    const multi = client.multi();
    multi.del(this.sessionKey(sid));
    multi.sRem(this.userIndexKey(current.userId), sid);
    multi.sRem(this.tenantIndexKey(current.tenantId), sid);
    multi.set(this.refreshLookupKey(current.refreshTokenHash), JSON.stringify({
      sid,
      familyId: current.refreshFamilyId,
      state: 'used',
    } satisfies RefreshTokenLookup));
    multi.expireAt(this.refreshLookupKey(current.refreshTokenHash), unixSeconds(current.expiresAt));
    await multi.exec();

    return {
      ...current,
      status,
      revokedAt,
      updatedAt: revokedAt,
    };
  }

  async listSessionIdsByUser(userId: string): Promise<string[]> {
    return this.pruneIndex(this.userIndexKey(userId));
  }

  async listSessionIdsByTenant(tenantId: string): Promise<string[]> {
    return this.pruneIndex(this.tenantIndexKey(tenantId));
  }

  async publishInvalidation(message: string): Promise<void> {
    await this.getClient().publish(this.options.redis.invalidateChannel, message);
  }

  private async pruneIndex(indexKey: string): Promise<string[]> {
    const client = this.getClient();
    const members = await client.sMembers(indexKey);
    const active: string[] = [];
    const stale: string[] = [];

    for (const sid of members) {
      const exists = await client.exists(this.sessionKey(sid));
      if (exists > 0) {
        active.push(sid);
      } else {
        stale.push(sid);
      }
    }

    if (stale.length > 0) {
      await client.sRem(indexKey, stale);
    }

    return active;
  }

  private getClient(): ReturnType<typeof createClient> {
    if (!this.client) {
      throw new Error('RedisSessionStore has not been initialized');
    }
    return this.client;
  }

  private sessionKey(sid: string): string {
    return `${this.options.redis.keyPrefix}:session:${sid}`;
  }

  private refreshLookupKey(hash: string): string {
    return `${this.options.redis.keyPrefix}:refresh:${hash}`;
  }

  private userIndexKey(userId: string): string {
    return `${this.options.redis.keyPrefix}:sessions_by_user:${userId}`;
  }

  private tenantIndexKey(tenantId: string): string {
    return `${this.options.redis.keyPrefix}:sessions_by_tenant:${tenantId}`;
  }
}
