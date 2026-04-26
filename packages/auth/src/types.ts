import type { Principal } from '@stech/stynx-contracts';

export interface StynxAuthModuleOptions {
  cognito?: {
    issuer: string;
    audience?: string;
    jwksUri?: string;
  };
  stynx?: {
    issuer: string;
    audience?: string;
    jwksUri?: string;
  };
  redis?: {
    url: string;
    keyPrefix?: string;
    invalidateChannel?: string;
  };
  permissions?: {
    dbFallbackOnRedisDown?: boolean;
    driftResyncIntervalMs?: number;
  };
}

export interface ResolvedStynxAuthModuleOptions {
  cognito?: {
    issuer: string;
    audience?: string;
    jwksUri?: string;
  };
  stynx: {
    issuer: string;
    audience?: string;
    jwksUri?: string;
  };
  redis?: {
    url: string;
    keyPrefix: string;
    invalidateChannel: string;
  };
  permissions: {
    dbFallbackOnRedisDown: boolean;
    driftResyncIntervalMs?: number;
  };
}

export interface CognitoAccessTokenClaims {
  sub: string;
  email?: string;
  username?: string;
  tokenUse?: string;
  claims: Record<string, unknown>;
}

export interface StynxAccessTokenClaims {
  sub: string;
  sid: string;
  tenantId: string;
  permsHash?: string;
  cognitoSub?: string;
  issuedAt?: number;
  expiresAt?: number;
  claims: Record<string, unknown>;
}

export interface PermissionCacheRecord {
  sid: string;
  userId: string;
  tenantId: string;
  membershipId: string;
  permissions: string[];
  hash: string;
  generation: number;
  computedAt: number;
}

export interface PermissionCacheBackend {
  get(sid: string): Promise<PermissionCacheRecord | null>;
  set(record: PermissionCacheRecord, ttlSeconds: number): Promise<void>;
  delete(sid: string): Promise<void>;
  invalidateScope(message: string): Promise<void>;
  subscribe(onMessage: (message: string) => Promise<void>): Promise<void>;
  publish(message: string): Promise<void>;
  close(): Promise<void>;
}

export interface HashProbeState {
  hash: string | null;
  generation: number;
}

export interface RequestLike {
  headers: Record<string, unknown>;
  body?: unknown;
  principal?: Principal;
  user?: unknown;
  actor?: unknown;
  tenantId?: string;
  stynxClaims?: StynxAccessTokenClaims;
  stynxReadonly?: boolean;
  res?: unknown;
  response?: unknown;
}

export function resolveAuthOptions(
  options: StynxAuthModuleOptions,
): ResolvedStynxAuthModuleOptions {
  return {
    ...(options.cognito ? { cognito: options.cognito } : {}),
    stynx: {
      issuer: options.stynx?.issuer ?? 'https://stynx.local',
      ...(options.stynx?.audience ? { audience: options.stynx.audience } : {}),
      ...(options.stynx?.jwksUri ? { jwksUri: options.stynx.jwksUri } : {}),
    },
    ...(options.redis
      ? {
          redis: {
            url: options.redis.url,
            keyPrefix: options.redis.keyPrefix ?? 'stynx:auth',
            invalidateChannel: options.redis.invalidateChannel ?? 'perms:invalidate',
          },
        }
      : {}),
    permissions: {
      dbFallbackOnRedisDown: options.permissions?.dbFallbackOnRedisDown ?? true,
      ...(options.permissions?.driftResyncIntervalMs !== undefined
        ? { driftResyncIntervalMs: options.permissions.driftResyncIntervalMs }
        : {}),
    },
  };
}
