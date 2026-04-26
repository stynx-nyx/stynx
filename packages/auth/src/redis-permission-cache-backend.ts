import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { STYNX_AUTH_OPTIONS } from './tokens';
import type { PermissionCacheBackend, PermissionCacheRecord, ResolvedStynxAuthModuleOptions } from './types';

@Injectable()
export class RedisPermissionCacheBackend implements PermissionCacheBackend, OnModuleInit, OnModuleDestroy {
  private client?: RedisClientType;
  private subscriber?: RedisClientType;
  private onMessage?: (message: string) => Promise<void>;

  constructor(
    @Inject(STYNX_AUTH_OPTIONS)
    private readonly options: ResolvedStynxAuthModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options.redis) {
      return;
    }
    if (this.client?.isOpen && this.subscriber?.isOpen) {
      return;
    }
    if (!this.client) {
      this.client = createClient({ url: this.options.redis.url });
      this.client.on('error', () => undefined);
    }
    if (!this.subscriber) {
      this.subscriber = this.client.duplicate();
      this.subscriber.on('error', () => undefined);
    }
    if (!this.client.isOpen) {
      await this.client.connect();
    }
    if (!this.subscriber.isOpen) {
      await this.subscriber.connect();
    }
    if (this.onMessage) {
      await this.subscriber.subscribe(this.options.redis.invalidateChannel, (message) => {
        void this.onMessage?.(message);
      });
    }
  }

  async get(sid: string): Promise<PermissionCacheRecord | null> {
    if (!this.client) {
      return null;
    }
    const raw = await this.client.get(this.recordKey(sid));
    return raw ? JSON.parse(raw) as PermissionCacheRecord : null;
  }

  async set(record: PermissionCacheRecord, ttlSeconds: number): Promise<void> {
    if (!this.client) {
      return;
    }
    const multi = this.client.multi();
    multi.set(this.recordKey(record.sid), JSON.stringify(record), { EX: ttlSeconds });
    multi.sAdd(this.userIndexKey(record.userId), record.sid);
    multi.sAdd(this.tenantIndexKey(record.tenantId), record.sid);
    multi.expire(this.userIndexKey(record.userId), ttlSeconds);
    multi.expire(this.tenantIndexKey(record.tenantId), ttlSeconds);
    await multi.exec();
  }

  async delete(sid: string): Promise<void> {
    if (!this.client) {
      return;
    }
    const record = await this.get(sid);
    const multi = this.client.multi();
    multi.del(this.recordKey(sid));
    if (record) {
      multi.sRem(this.userIndexKey(record.userId), sid);
      multi.sRem(this.tenantIndexKey(record.tenantId), sid);
    }
    await multi.exec();
  }

  async invalidateScope(message: string): Promise<void> {
    if (!this.client) {
      return;
    }
    const [userId, tenantId] = message.split(':');
    if (!userId || !tenantId) {
      return;
    }

    if (userId === '*' && tenantId === '*') {
      for await (const keys of this.client.scanIterator({ MATCH: `${this.options.redis?.keyPrefix}:perms:*` })) {
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          const sid = String(key).split(':').pop();
          if (sid) {
            await this.delete(sid);
          }
        }
      }
      return;
    }

    if (userId === '*') {
      const sids = await this.client.sMembers(this.tenantIndexKey(tenantId));
      await Promise.all(sids.map((sid) => this.delete(sid)));
      return;
    }

    const candidates = await this.client.sMembers(this.userIndexKey(userId));
    await Promise.all(
      candidates.map(async (sid) => {
        const record = await this.get(sid);
        if (record && record.tenantId === tenantId) {
          await this.delete(sid);
        }
      }),
    );
  }

  async subscribe(onMessage: (message: string) => Promise<void>): Promise<void> {
    this.onMessage = onMessage;
    if (this.subscriber && this.options.redis) {
      await this.subscriber.subscribe(this.options.redis.invalidateChannel, (message) => {
        void onMessage(message);
      });
    }
  }

  async publish(message: string): Promise<void> {
    if (this.client && this.options.redis) {
      await this.client.publish(this.options.redis.invalidateChannel, message);
    }
  }

  async close(): Promise<void> {
    if (this.subscriber?.isOpen) {
      await this.subscriber.quit();
    }
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.close();
  }

  private recordKey(sid: string): string {
    return `${this.options.redis?.keyPrefix}:perms:${sid}`;
  }

  private userIndexKey(userId: string): string {
    return `${this.options.redis?.keyPrefix}:user:${userId}`;
  }

  private tenantIndexKey(tenantId: string): string {
    return `${this.options.redis?.keyPrefix}:tenant:${tenantId}`;
  }
}
