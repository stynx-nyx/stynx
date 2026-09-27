import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import {
  createClient,
  type RedisClientType,
  type RedisFunctions,
  type RedisModules,
  type RedisScripts,
} from 'redis';
import { STYNX_SESSIONS_OPTIONS } from './tokens';
import type {
  RefreshTokenLookup,
  ResolvedStynxSessionsModuleOptions,
  SessionRecord,
  SessionStatus,
  SessionStore,
  SessionPolicyOptions,
  SessionPolicyResult,
} from './types';
import { SessionConflictError, SessionExchangeError } from './errors';

const CREATE_WITH_POLICY = `
local prefix, recordJson, mode, priorSid = ARGV[1], ARGV[2], ARGV[3], ARGV[4]
local record = cjson.decode(recordJson)
local function sessionKey(sid) return prefix .. ':session:' .. sid end
local function refreshKey(hash) return prefix .. ':refresh:' .. hash end
local function load(sid)
  local raw = redis.call('GET', sessionKey(sid))
  if not raw then return nil end
  return cjson.decode(raw)
end
local function isActive(s)
  return s.status == 'active' and s.expiresAt > ARGV[5] and s.idleExpiresAt > ARGV[5]
end
local prior = nil
if priorSid ~= '' then
  prior = load(priorSid)
  if not prior or prior.userId ~= record.userId or not isActive(prior) then
    return cjson.encode({error='prior'})
  end
end
local conflicts = {}
for _, sid in ipairs(redis.call('SMEMBERS', prefix .. ':sessions_by_user:' .. record.userId)) do
  if sid ~= priorSid then
    local s = load(sid)
    if s and s.tenantId == record.tenantId and isActive(s) then
      conflicts[#conflicts + 1] = s
    end
  end
end
if mode == 'reject-new' and #conflicts > 0 then
  return cjson.encode({error='conflict'})
end
local revoked = {}
local function revoke(s)
  local ttl = redis.call('PTTL', sessionKey(s.sid))
  redis.call('DEL', sessionKey(s.sid))
  redis.call('SREM', prefix .. ':sessions_by_user:' .. s.userId, s.sid)
  redis.call('SREM', prefix .. ':sessions_by_tenant:' .. s.tenantId, s.sid)
  redis.call('SET', refreshKey(s.refreshTokenHash), cjson.encode({sid=s.sid,familyId=s.refreshFamilyId,state='used'}))
  if ttl > 0 then redis.call('PEXPIRE', refreshKey(s.refreshTokenHash), ttl) end
  s.status = 'revoked'
  s.revokedAt = ARGV[5]
  s.updatedAt = ARGV[5]
  revoked[#revoked + 1] = s
end
if mode == 'revoke-existing' then
  for _, s in ipairs(conflicts) do revoke(s) end
end
if prior then revoke(prior) end
redis.call('SET', sessionKey(record.sid), recordJson)
redis.call('EXPIREAT', sessionKey(record.sid), tonumber(ARGV[6]))
redis.call('SADD', prefix .. ':sessions_by_user:' .. record.userId, record.sid)
redis.call('SADD', prefix .. ':sessions_by_tenant:' .. record.tenantId, record.sid)
redis.call('SET', refreshKey(record.refreshTokenHash), cjson.encode({sid=record.sid,familyId=record.refreshFamilyId,state='active'}))
redis.call('EXPIREAT', refreshKey(record.refreshTokenHash), tonumber(ARGV[6]))
if #revoked == 0 then return '{"revoked":[]}' end
return cjson.encode({revoked=revoked})
`;

function unixSeconds(isoTimestamp: string): number {
  return Math.ceil(new Date(isoTimestamp).getTime() / 1000);
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
}

/**
 * Client type for the RESP2-pinned connection created below. node-redis 6
 * defaults the RESP generic to 3, so the field annotation must say 2 as well.
 */
type Resp2RedisClient = RedisClientType<RedisModules, RedisFunctions, RedisScripts, 2>;

@Injectable()
export class RedisSessionStore implements SessionStore, OnModuleInit, OnModuleDestroy {
  private client?: Resp2RedisClient;

  constructor(
    @Inject(STYNX_SESSIONS_OPTIONS)
    private readonly options: ResolvedStynxSessionsModuleOptions,
  ) {}

  async onModuleInit(): Promise<void> {
    const client: Resp2RedisClient = createClient({
      url: this.options.redis.url,
      // node-redis 6 defaults to RESP3. Pin RESP2 so the wire protocol, reply
      // shapes and the Redis server requirement stay exactly as in 1.2.x;
      // switching to RESP3 is a separate, documented decision.
      RESP: 2,
    });
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

  async createWithPolicy(record: SessionRecord, options: SessionPolicyOptions): Promise<SessionPolicyResult> {
    const reply = await this.getClient().eval(CREATE_WITH_POLICY, {
      keys: [],
      arguments: [
        this.options.redis.keyPrefix,
        JSON.stringify(record),
        options.mode,
        options.priorSessionId ?? '',
        options.now,
        String(unixSeconds(record.expiresAt)),
      ],
    });
    if (typeof reply !== 'string') throw new Error('Invalid Redis policy reply');
    const result = JSON.parse(reply) as { error?: string; revoked?: SessionRecord[] };
    if (result.error === 'conflict') throw new SessionConflictError();
    if (result.error === 'prior') throw new SessionExchangeError('SESSION_NOT_ACTIVE', 'Prior session is not active');
    if (result.revoked && !Array.isArray(result.revoked)) throw new Error('Invalid Redis policy result');
    return { created: record, revoked: result.revoked ?? [] };
  }

  async probeReadiness(): Promise<boolean> {
    const client = this.getClient();
    if (!client.isReady) return false;
    return (await client.ping()) === 'PONG';
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

  private getClient(): Resp2RedisClient {
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
