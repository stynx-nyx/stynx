import type { RefreshTokenLookup, SessionRecord } from './types.js';

interface RedisPolicyReply {
  error?: 'conflict' | 'prior';
  revoked?: SessionRecord[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string');
}

/** Validate declared fields while preserving opaque JSON extensions on the original object. */
function isSessionRecord(value: unknown): value is SessionRecord {
  return (
    isObject(value) &&
    typeof value.sid === 'string' &&
    typeof value.userId === 'string' &&
    typeof value.tenantId === 'string' &&
    typeof value.cognitoSub === 'string' &&
    typeof value.refreshFamilyId === 'string' &&
    typeof value.refreshTokenHash === 'string' &&
    (value.status === 'active' || value.status === 'revoked' || value.status === 'reuse_detected') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    typeof value.lastTouchedAt === 'string' &&
    typeof value.expiresAt === 'string' &&
    typeof value.idleExpiresAt === 'string' &&
    isOptionalString(value.membershipId) &&
    isOptionalString(value.permsHash) &&
    isOptionalString(value.revokedAt) &&
    isOptionalString(value.strongFactorVerifiedAt) &&
    (value.permissions === undefined || isStringArray(value.permissions)) &&
    (value.roles === undefined || isStringArray(value.roles)) &&
    (value.deviceMeta === undefined || isObject(value.deviceMeta))
  );
}

function isRefreshTokenLookup(value: unknown): value is RefreshTokenLookup {
  return (
    isObject(value) &&
    typeof value.sid === 'string' &&
    typeof value.familyId === 'string' &&
    (value.state === 'active' || value.state === 'used')
  );
}

function isPolicyReply(value: unknown): value is RedisPolicyReply {
  return (
    isObject(value) &&
    (value.error === undefined || value.error === 'conflict' || value.error === 'prior') &&
    (value.revoked === undefined ||
      (Array.isArray(value.revoked) && value.revoked.every(isSessionRecord)))
  );
}

function parseJson(value: string, message: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    // SyntaxError messages can contain cached credentials or session payload excerpts.
    throw new Error(message);
  }
}

export function parseRedisSessionRecord(value: string | null): SessionRecord | null {
  if (!value) return null;
  const message = 'Invalid Redis session record';
  const parsed = parseJson(value, message);
  if (!isSessionRecord(parsed)) throw new Error(message);
  return parsed;
}

export function parseRedisRefreshLookup(value: string | null): RefreshTokenLookup | null {
  if (!value) return null;
  const message = 'Invalid Redis refresh lookup';
  const parsed = parseJson(value, message);
  if (!isRefreshTokenLookup(parsed)) throw new Error(message);
  return parsed;
}

export function parseRedisPolicyReply(value: string): RedisPolicyReply {
  const message = 'Invalid Redis policy result';
  const parsed = parseJson(value, message);
  if (!isPolicyReply(parsed)) throw new Error(message);
  return parsed;
}
