import { Inject, Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  createClient,
  type RedisClientType,
  type RedisFunctions,
  type RedisModules,
  type RedisScripts,
} from 'redis';
import { STYNX_IDEMPOTENCY_OPTIONS } from './constants';
import type {
  IdempotencyBackend,
  IdempotencyDecisionContext,
  IdempotencyInterceptorOptions,
  IdempotencyStoredEntry,
} from './types';

function stringifyIdempotencyValue(value: unknown): string {
  return JSON.stringify(value, (_key, current) => (typeof current === 'bigint' ? current.toString() : current));
}

/**
 * Client type for the RESP2-pinned connection created below. node-redis 6
 * defaults the RESP generic to 3, so the field annotation must say 2 as well.
 */
type Resp2RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts, 2>;

@Injectable()
export class RedisIdempotencyBackend implements IdempotencyBackend, OnModuleInit, OnModuleDestroy {
  private client?: Resp2RedisClient;

  constructor(
    @Optional()
    @Inject(STYNX_IDEMPOTENCY_OPTIONS)
    private readonly options?: IdempotencyInterceptorOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options?.redis) {
      return;
    }
    this.client = createClient({
      url: this.options.redis.url,
      // node-redis 6 defaults to RESP3. Pin RESP2 so the wire protocol, reply
      // shapes and the Redis server requirement stay exactly as in 1.2.x;
      // switching to RESP3 is a separate, documented decision.
      RESP: 2,
    });
    this.client.on('error', () => undefined);
    await this.client.connect();
  }

  async get(context: IdempotencyDecisionContext): Promise<IdempotencyStoredEntry | null> {
    if (!this.client) {
      return null;
    }
    const raw = await this.client.get(this.entryKey(context));
    return raw ? JSON.parse(raw) as IdempotencyStoredEntry : null;
  }

  async set(context: IdempotencyDecisionContext, entry: IdempotencyStoredEntry): Promise<void> {
    if (!this.client) {
      return;
    }
    await this.client.set(this.entryKey(context), stringifyIdempotencyValue(entry), {
      PX: context.ttlMs,
    });
  }

  async acquireLock(context: IdempotencyDecisionContext, token: string): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    const result = await this.client.set(this.lockKey(context), token, {
      PX: context.ttlMs,
      NX: true,
    });
    return result === 'OK';
  }

  async releaseLock(context: IdempotencyDecisionContext, token: string): Promise<void> {
    if (!this.client) {
      return;
    }
    const key = this.lockKey(context);
    const current = await this.client.get(key);
    if (current === token) {
      await this.client.del(key);
    }
  }

  async isLocked(context: IdempotencyDecisionContext): Promise<boolean> {
    if (!this.client) {
      return false;
    }
    return (await this.client.exists(this.lockKey(context))) === 1;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private entryKey(context: IdempotencyDecisionContext): string {
    const prefix = this.options?.redis?.keyPrefix ?? 'stynx:idempotency';
    return `${prefix}:entry:${context.compositeKey}`;
  }

  private lockKey(context: IdempotencyDecisionContext): string {
    const prefix = this.options?.redis?.keyPrefix ?? 'stynx:idempotency';
    return `${prefix}:lock:${context.compositeKey}`;
  }
}
