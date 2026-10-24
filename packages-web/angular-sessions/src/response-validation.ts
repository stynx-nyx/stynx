import type { StynxActiveSession, StynxSessionControlCapabilities, StynxSessionGuarantee, StynxActiveSessionGuarantee, StynxSessionMutationResult } from './types';

export interface SdkActiveSessionResponse {
  sid?: string | null;
  sessionId?: string | null;
  tenantId?: string | null;
  tenant_id?: string | null;
  createdAt?: string | null;
  created_at?: string | null;
  expiresAt?: string | null;
  expires_at?: string | null;
  lastIp?: string | null;
  last_ip?: string | null;
  userAgent?: string | null;
  user_agent?: string | null;
  lastSeenAt?: string | null;
  last_seen_at?: string | null;
  current?: boolean | null;
  scope?: 'tenant' | 'platform';
  state?: StynxActiveSession['state'];
  provider?: string;
  deviceLabel?: string;
  client?: string;
  capabilities?: StynxActiveSession['capabilities'];
  guarantee?: StynxActiveSession['guarantee'];
}

/** Complete declared-field guards; returned values retain identity and unknown extensions. */
export type Guard<T> = (value: unknown) => value is T;
type Shape<T> = { [K in keyof T]-?: Guard<T[K]> };

export const string: Guard<string> = (value): value is string => typeof value === 'string';
export const number: Guard<number> = (value): value is number => typeof value === 'number';
export const boolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean';
export const opaque: Guard<unknown> = (_value): _value is unknown => true;
export const record: Guard<Record<string, unknown>> = (value): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
export const nullValue: Guard<null> = (value): value is null => value === null;

export function optional<T>(guard: Guard<T>): Guard<T | undefined> {
  return (value): value is T | undefined => value === undefined || guard(value);
}
export function nullable<T>(guard: Guard<T>): Guard<T | null> {
  return (value): value is T | null => value === null || guard(value);
}
export function array<T>(guard: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!Array.isArray(value)) return false;
    // Visit empty slots too; every() skips them and cannot establish T[].
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      if (!guard(item)) return false;
    }
    return true;
  };
}
export function union<A, B>(left: Guard<A>, right: Guard<B>): Guard<A | B> {
  return (value): value is A | B => left(value) || right(value);
}
export function literals<const T extends string>(...values: readonly T[]): Guard<T> {
  return (value): value is T => values.some((candidate) => candidate === value);
}
export function object<T extends object>(shape: Shape<T>): Guard<T> {
  return (value): value is T => {
    if (!record(value)) return false;
    for (const key in shape) {
      if (!shape[key](value[key])) return false;
    }
    return true;
  };
}
export function decode<T>(guard: Guard<T>, name: string): (value: unknown) => T {
  return (value) => {
    if (!guard(value)) throw new TypeError(`Invalid ${name} response`);
    return value;
  };
}


const guaranteeKind = literals('immediate_local', 'bounded_local', 'refresh_revoked_access_expires', 'provider_confirmed', 'none');
const mutationStatus = literals('pending', 'revoked', 'unsupported', 'failed');
const capabilities = object<StynxSessionControlCapabilities>({
  revokeOne: boolean, revokeOthers: boolean, revokeAll: boolean,
  localEnforcement: literals('immediate', 'bounded', 'none'), providerConfirmation: boolean,
});
const guarantee = object<StynxSessionGuarantee>({
  kind: guaranteeKind, effectiveBy: nullable(string), propagationBoundSeconds: nullable(number),
  accessTokenExpiresAt: nullable(string),
});
const listGuarantee = object<StynxActiveSessionGuarantee>({
  kind: guaranteeKind, effectiveBy: nullable(string), propagationBoundSeconds: nullable(number),
  accessTokenExpiresAt: optional(nullable(string)),
});
const activeSession = object<SdkActiveSessionResponse>({
  sid: optional(nullable(string)), sessionId: optional(nullable(string)),
  tenantId: optional(nullable(string)), tenant_id: optional(nullable(string)),
  createdAt: optional(nullable(string)), created_at: optional(nullable(string)),
  expiresAt: optional(nullable(string)), expires_at: optional(nullable(string)),
  lastIp: optional(nullable(string)), last_ip: optional(nullable(string)),
  userAgent: optional(nullable(string)), user_agent: optional(nullable(string)),
  lastSeenAt: optional(nullable(string)), last_seen_at: optional(nullable(string)),
  current: optional(nullable(boolean)), scope: optional(literals('tenant', 'platform')),
  state: optional(literals('active', 'revocation_pending', 'revoked', 'failed', 'unsupported', 'expired', 'retired')),
  provider: optional(string), deviceLabel: optional(string), client: optional(string),
  capabilities: optional(capabilities), guarantee: optional(listGuarantee),
});
const mutation = object<StynxSessionMutationResult>({
  operationId: string,
  action: literals('logout-current', 'revoke-one', 'revoke-others', 'revoke-all', 'revoke-subject', 'revoke-tenant'),
  scope: literals('tenant', 'identity'), status: mutationStatus,
  guarantee, effectiveBy: nullable(string), errorCode: optional(string),
  results: array(object<StynxSessionMutationResult['results'][number]>({
    sid: string, status: mutationStatus, guarantee, errorCode: optional(string),
  })),
});
export const decodeSessions = decode(array(activeSession), 'active sessions');
const decodeMutationResult = decode(mutation, 'session mutation');
export function decodeMutation(value: unknown): StynxSessionMutationResult | null {
  return value === null || value === undefined ? null : decodeMutationResult(value);
}
