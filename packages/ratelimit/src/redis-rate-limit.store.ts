import { Inject, Injectable, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { createClient, type RedisClientType } from 'redis';
import { STYNX_RATE_LIMIT_OPTIONS } from './constants';
import type { RateLimitDecision, RateLimitDecisionContext, RateLimitGuardOptions, RateLimitStore } from './types';

const SLIDING_WINDOW_LUA = `
local zsetKey = KEYS[1]
local hashKey = KEYS[2]
local totalKey = KEYS[3]
local now = tonumber(ARGV[1])
local windowMs = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local cost = tonumber(ARGV[4])
local member = ARGV[5]
local minScore = now - windowMs

local expired = redis.call('ZRANGEBYSCORE', zsetKey, '-inf', minScore)
local removedCost = 0
if #expired > 0 then
  local weights = redis.call('HMGET', hashKey, unpack(expired))
  for i = 1, #weights do
    removedCost = removedCost + tonumber(weights[i] or '0')
  end
  redis.call('ZREMRANGEBYSCORE', zsetKey, '-inf', minScore)
  redis.call('HDEL', hashKey, unpack(expired))
  if removedCost > 0 then
    redis.call('DECRBY', totalKey, removedCost)
  end
end

local current = tonumber(redis.call('GET', totalKey) or '0')
local oldest = redis.call('ZRANGE', zsetKey, 0, 0, 'WITHSCORES')
local resetAt = now + windowMs
if #oldest >= 2 then
  resetAt = tonumber(oldest[2]) + windowMs
end

if current + cost > limit then
  local remaining = math.max(limit - current, 0)
  local retryAfter = math.max(1, math.ceil((resetAt - now) / 1000))
  return {0, limit, remaining, resetAt, retryAfter, current}
end

redis.call('ZADD', zsetKey, now, member)
redis.call('HSET', hashKey, member, cost)
local used = redis.call('INCRBY', totalKey, cost)
local ttlMs = math.max(windowMs * 2, 1000)
redis.call('PEXPIRE', zsetKey, ttlMs)
redis.call('PEXPIRE', hashKey, ttlMs)
redis.call('PEXPIRE', totalKey, ttlMs)

oldest = redis.call('ZRANGE', zsetKey, 0, 0, 'WITHSCORES')
if #oldest >= 2 then
  resetAt = tonumber(oldest[2]) + windowMs
end

local remaining = math.max(limit - used, 0)
local retryAfter = math.max(1, math.ceil((resetAt - now) / 1000))
return {1, limit, remaining, resetAt, retryAfter, used}
`;

@Injectable()
export class RedisSlidingWindowRateLimitStore implements RateLimitStore, OnModuleInit, OnModuleDestroy {
  private client?: RedisClientType;
  private scriptSha?: string;
  private sequence = 0;

  constructor(
    @Optional()
    @Inject(STYNX_RATE_LIMIT_OPTIONS)
    private readonly options?: RateLimitGuardOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.options?.redis) {
      return;
    }
    this.client = createClient({ url: this.options.redis.url });
    this.client.on('error', () => undefined);
    await this.client.connect();
    this.scriptSha = await this.client.scriptLoad(SLIDING_WINDOW_LUA);
  }

  async consume(context: RateLimitDecisionContext): Promise<RateLimitDecision> {
    if (!this.client || !this.scriptSha) {
      throw new Error('Redis rate limit store is not configured');
    }
    const now = Date.now();
    const baseKey = this.baseKey(context);
    this.sequence = (this.sequence + 1) % Number.MAX_SAFE_INTEGER;
    const member = `${now}:${this.sequence}`;
    const result = await this.client.evalSha(this.scriptSha, {
      keys: [`${baseKey}:events`, `${baseKey}:weights`, `${baseKey}:total`],
      arguments: [
        String(now),
        String(context.ttlMs),
        String(context.limit),
        String(context.cost),
        member,
      ],
    });
    const numeric = (result as Array<number | string>).map((value) => Number(value));
    const allowed = numeric[0] ?? 0;
    const limit = numeric[1] ?? context.limit;
    const remaining = numeric[2] ?? Math.max(context.limit - context.cost, 0);
    const resetAtEpochMs = numeric[3] ?? now + context.ttlMs;
    const retryAfterSeconds = numeric[4] ?? Math.max(1, Math.ceil(context.ttlMs / 1000));
    const used = numeric[5] ?? context.cost;
    return { allowed: allowed === 1, limit, remaining, resetAtEpochMs, retryAfterSeconds, used };
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client?.isOpen) {
      await this.client.quit();
    }
  }

  private baseKey(context: RateLimitDecisionContext): string {
    const prefix = this.options?.redis?.keyPrefix ?? 'stynx:ratelimit';
    return `${prefix}:${context.bucket}:${context.scope}:${context.bucketKey}`;
  }
}
