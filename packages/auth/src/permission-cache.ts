import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit, Optional } from '@nestjs/common';
import { STYNX_AUTH_OPTIONS, STYNX_PERMISSION_CACHE_BACKEND } from './tokens';
import { PermissionCacheMetrics } from './permission-cache-metrics';
import { PermissionQueryService } from './permission-query.service';
import type {
  HashProbeState,
  PermissionCacheBackend,
  PermissionCacheRecord,
  ResolvedStynxAuthModuleOptions,
  StynxAccessTokenClaims,
} from './types';

interface TtlEntry<TValue> {
  value: TValue;
  expiresAt: number;
}

class TtlLruCache<TKey, TValue> {
  private readonly store = new Map<TKey, TtlEntry<TValue>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxSize: number,
  ) {}

  get(key: TKey): TValue | undefined {
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key: TKey, value: TValue): void {
    this.store.delete(key);
    this.store.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
    if (this.store.size > this.maxSize) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) {
        this.store.delete(oldest);
      }
    }
  }

  delete(key: TKey): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  values(): TValue[] {
    return [...this.store.values()].map((entry) => entry.value);
  }
}

@Injectable()
export class PermissionCache implements OnModuleInit, OnModuleDestroy {
  private readonly inMemory = new TtlLruCache<string, PermissionCacheRecord>(5_000, 10_000);
  private readonly hashProbe = new TtlLruCache<string, HashProbeState>(1_000, 10_000);

  constructor(
    @Inject(STYNX_AUTH_OPTIONS)
    private readonly options: ResolvedStynxAuthModuleOptions,
    @Optional()
    @Inject(STYNX_PERMISSION_CACHE_BACKEND)
    private readonly backend: PermissionCacheBackend | null,
    private readonly queries: PermissionQueryService,
    private readonly metrics: PermissionCacheMetrics,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.backend) {
      await this.backend.subscribe(async (message) => {
        await this.handleInvalidation(message);
      });
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.backend?.close();
  }

  async getForSession(claims: StynxAccessTokenClaims): Promise<PermissionCacheRecord> {
    const inMemory = this.inMemory.get(claims.sid);
    if (inMemory && (!claims.permsHash || inMemory.hash === claims.permsHash)) {
      const drift = await this.detectHashDrift(inMemory.userId, inMemory.tenantId, inMemory.hash);
      if (!drift) {
        this.metrics.increment('in_memory');
        return inMemory;
      }
    }

    if (this.backend) {
      try {
        const redisRecord = await this.backend.get(claims.sid);
        if (redisRecord && (!claims.permsHash || redisRecord.hash === claims.permsHash)) {
          const drift = await this.detectHashDrift(redisRecord.userId, redisRecord.tenantId, redisRecord.hash);
          if (!drift) {
            this.inMemory.set(claims.sid, redisRecord);
            this.metrics.increment('redis');
            return redisRecord;
          }
        }
      } catch (error) {
        if (!this.options.permissions.dbFallbackOnRedisDown) {
          throw error;
        }
      }
    }

    const recomputed = await this.recompute(claims.sub, claims.tenantId, claims.sid);
    this.metrics.increment('db');
    return recomputed;
  }

  async prime(record: PermissionCacheRecord, expiresAtIso: string): Promise<void> {
    this.inMemory.set(record.sid, record);
    this.hashProbe.set(this.hashProbeKey(record.userId, record.tenantId), {
      hash: record.hash,
      generation: record.generation,
    });
    if (this.backend) {
      const ttlSeconds = Math.max(1, Math.ceil((new Date(expiresAtIso).getTime() - Date.now()) / 1000));
      await this.backend.set(record, ttlSeconds);
    }
  }

  async invalidateSid(sid: string): Promise<void> {
    this.inMemory.delete(sid);
    if (this.backend) {
      await this.backend.delete(sid);
    }
  }

  async publishInvalidation(message: string): Promise<void> {
    await this.backend?.publish(message);
  }

  async inspectSid(sid: string): Promise<PermissionCacheRecord | null> {
    return this.inMemory.get(sid) ?? (this.backend ? this.backend.get(sid) : null);
  }

  private async recompute(userId: string, tenantId: string, sid: string): Promise<PermissionCacheRecord> {
    const resolved = await this.queries.resolveForUser(userId, tenantId);
    const record: PermissionCacheRecord = {
      sid,
      userId,
      tenantId,
      membershipId: resolved.membershipId,
      permissions: resolved.permissions,
      hash: resolved.hash,
      generation: resolved.generation,
      computedAt: Date.now(),
    };
    this.inMemory.set(sid, record);
    this.hashProbe.set(this.hashProbeKey(userId, tenantId), {
      hash: record.hash,
      generation: record.generation,
    });
    if (this.backend) {
      await this.backend.set(record, 24 * 60 * 60);
    }
    return record;
  }

  private async detectHashDrift(userId: string, tenantId: string, currentHash: string): Promise<boolean> {
    const key = this.hashProbeKey(userId, tenantId);
    const cached = this.hashProbe.get(key);
    if (cached) {
      return cached.hash !== currentHash;
    }

    const probed = await this.queries.probeHash(userId, tenantId);
    this.hashProbe.set(key, probed);
    return probed.hash !== null && probed.hash !== currentHash;
  }

  private async handleInvalidation(message: string): Promise<void> {
    const [userId, tenantId] = message.split(':');
    if (!userId || !tenantId) {
      return;
    }

    if (userId === '*' && tenantId === '*') {
      this.inMemory.clear();
      if (this.backend) {
        await this.backend.invalidateScope(message);
      }
      return;
    }

    for (const record of this.inMemory.values()) {
      const userMatches = userId === '*' || record.userId === userId;
      const tenantMatches = tenantId === '*' || record.tenantId === tenantId;
      if (userMatches && tenantMatches) {
        this.inMemory.delete(record.sid);
      }
    }

    if (this.backend) {
      await this.backend.invalidateScope(message);
    }
  }

  private hashProbeKey(userId: string, tenantId: string): string {
    return `${userId}:${tenantId}`;
  }
}
