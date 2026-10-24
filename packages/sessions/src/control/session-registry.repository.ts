import { z } from 'zod';
import { defineQuery, sql } from '@stynx-nyx/data';
import type { SessionGuarantee, SessionItemResult, SessionMutationResult } from './types.js';

const text = z.string();
const uuid = z.string().regex(/^(?:(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}|\{(?:[0-9a-f]{4}-?){7}[0-9a-f]{4}\})$/iu);
const nullableText = text.nullable();
const opaqueBytes = z.custom<Uint8Array>((value): value is Uint8Array => value instanceof Uint8Array);
const timestamp = z.union([z.instanceof(Date), text, z.literal(Infinity), z.literal(-Infinity)]);
const nullableTimestamp = timestamp.nullable();
const propagationSeconds = z.number().int().min(1).max(30).nullable();
const scope = z.enum(['tenant', 'identity']);
const action = z.enum(['logout-current', 'revoke-one', 'revoke-others', 'revoke-all', 'revoke-subject', 'revoke-tenant']);
const state = z.enum(['active', 'revocation_pending', 'revoked', 'failed', 'unsupported', 'expired', 'retired']);
const status = z.enum(['pending', 'revoked', 'unsupported', 'failed']);
const guaranteeKind = z.enum(['immediate_local', 'bounded_local', 'refresh_revoked_access_expires', 'provider_confirmed', 'none']);
const capabilities = z.object({
 stableSessionIdentity: z.boolean(), listScopes: z.array(scope), controlScopes: z.array(scope),
 revokeOne: z.boolean(), revokeOthers: z.boolean(), revokeAll: z.boolean(),
 localEnforcement: z.enum(['immediate', 'bounded', 'none']), providerConfirmation: z.boolean(),
 retryReconciliation: z.boolean(), identityGlobalAuthority: z.boolean(), sharedAnchorBlastRadius: z.boolean(),
}).passthrough();
function isRecord(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNullableText(value: unknown): value is string | null {
 return value === null || typeof value === 'string';
}

function hasExactErrorCode(value: Record<string, unknown>): boolean {
 return !('errorCode' in value) || typeof value.errorCode === 'string';
}

function isGuarantee(value: unknown): value is SessionGuarantee {
 return isRecord(value) && guaranteeKind.safeParse(value.kind).success &&
  isNullableText(value.effectiveBy) && isNullableText(value.accessTokenExpiresAt) &&
  (value.propagationBoundSeconds === null ||
   (typeof value.propagationBoundSeconds === 'number' && Number.isFinite(value.propagationBoundSeconds)));
}

function isItemResult(value: unknown): value is SessionItemResult {
 return isRecord(value) && typeof value.sid === 'string' && status.safeParse(value.status).success &&
  isGuarantee(value.guarantee) && hasExactErrorCode(value);
}

function isMutationResult(value: unknown): value is SessionMutationResult {
 if (!isRecord(value) || typeof value.operationId !== 'string' ||
  !action.safeParse(value.action).success || !scope.safeParse(value.scope).success ||
  !status.safeParse(value.status).success || !isGuarantee(value.guarantee) ||
  !isNullableText(value.effectiveBy) || !Array.isArray(value.results) || !hasExactErrorCode(value)) return false;
 const items: unknown[] = value.results;
 for (const item of items) {
  if (!isItemResult(item)) return false;
 }
 return true;
}

// Stored results retain their original object and opaque extension identities.
const mutationResult = z.custom<SessionMutationResult>(isMutationResult);
const registrationRow = z.object({
 sid: uuid, anchor_id: uuid, tenant_id: uuid, subject_id: text, state, provider: text, capabilities,
 provider_label: text, device_label: nullableText, client_label: nullableText, user_agent_family: nullableText,
 device_class: nullableText, country: nullableText, region: nullableText, guarantee: guaranteeKind,
 effective_by: nullableTimestamp, propagation_bound_seconds: propagationSeconds,
 access_token_expires_at: nullableTimestamp, blast_radius: scope, created_at: timestamp,
 last_seen_at: nullableTimestamp, expires_at: nullableTimestamp, terminal_at: nullableTimestamp,
});
const operationRow = z.object({
 operation_id: uuid, scope, actor_id: text, action, request_hash: text, result_json: mutationResult,
 attempt_count: z.union([z.number().int().nonnegative().max(2147483647), text.regex(/^\d+$/u).refine((value) => Number(value) <= 2147483647)]), next_attempt_at: nullableTimestamp, lease_until: nullableTimestamp,
});
export type RegistrationRow = z.output<typeof registrationRow>;
export type OperationRow = z.output<typeof operationRow>;

export const provisionAnchor = defineQuery({
 name: 'sessions.provisionAnchor',
 text: sql`insert into auth.session_provider_anchors
           (id,provider,encrypted_handle,keyed_fingerprint,provider_subject_key,state,capabilities,expires_at)
         values ($1::uuid,$2,$3,$4,$5,'active',$6::jsonb,$7)
         on conflict (id) do update set state='active', capabilities=excluded.capabilities,
           last_seen_at=clock_timestamp(), expires_at=excluded.expires_at`,
 params: z.tuple([uuid, text, opaqueBytes.nullable(), opaqueBytes.nullable(), text, text, nullableTimestamp]), row: z.object({}), expects: 'none',
});

export const listRegistrations = defineQuery({
 name: 'sessions.listRegistrations',
 text: sql`select r.*, a.provider, a.capabilities
             from auth.session_registrations r
             join auth.session_provider_anchors a on a.id = r.anchor_id
            where r.tenant_id = $1::uuid
              and ($2::text is null or r.subject_id = $2)
            order by r.last_seen_at desc nulls last, r.created_at desc`,
 params: z.tuple([uuid, nullableText]), row: registrationRow, expects: 'many',
});

export const registerSession = defineQuery({
 name: 'sessions.registerSession',
 text: sql`insert into auth.session_registrations
           (sid, anchor_id, tenant_id, subject_id, state, provider_label, device_label,
            client_label, user_agent_family, device_class, country, region, guarantee,
            propagation_bound_seconds, effective_by, access_token_expires_at, blast_radius,
            created_at, last_seen_at, expires_at, terminal_at)
         values ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         on conflict (sid) do update set
           state=excluded.state, provider_label=excluded.provider_label,
           device_label=excluded.device_label, client_label=excluded.client_label,
           user_agent_family=excluded.user_agent_family, device_class=excluded.device_class,
           country=excluded.country, region=excluded.region, guarantee=excluded.guarantee,
           propagation_bound_seconds=excluded.propagation_bound_seconds,
           effective_by=excluded.effective_by, access_token_expires_at=excluded.access_token_expires_at,
           blast_radius=excluded.blast_radius, last_seen_at=excluded.last_seen_at,
           expires_at=excluded.expires_at, terminal_at=excluded.terminal_at
         returning *, $22::text as provider, $23::jsonb as capabilities`,
 params: z.tuple([uuid, uuid, uuid, text, state, text, nullableText, nullableText, nullableText, nullableText, nullableText, nullableText, guaranteeKind, propagationSeconds, nullableTimestamp, nullableTimestamp, scope, timestamp, nullableTimestamp, nullableTimestamp, nullableTimestamp, text, text]), row: registrationRow, expects: 'one',
});

export const findOperation = defineQuery({
 name: 'sessions.findOperation',
 text: sql`select operation_id, scope, actor_id, action, request_hash, result_json,
                attempt_count, next_attempt_at, lease_until
           from auth.session_operations
          where operation_id=$1::uuid and scope=$2 and actor_id=$3 and action=$4`,
 params: z.tuple([uuid, text, text, text]), row: operationRow, expects: 'zero-or-one',
});

export const saveOperation = defineQuery({
 name: 'sessions.saveOperation',
 text: sql`insert into auth.session_operations
           (operation_id, scope, tenant_id, actor_id, subject_id, action, request_hash,
            state, guarantee, attempt_count, next_attempt_at, lease_until, completed_at,
            terminal_at, result_json)
         values ($1::uuid,$2,current_setting('app.tenant_id')::uuid,$3,null,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
         on conflict (tenant_id, operation_id) do update set
           state=excluded.state, guarantee=excluded.guarantee,
           attempt_count=excluded.attempt_count, next_attempt_at=excluded.next_attempt_at,
           lease_until=excluded.lease_until, completed_at=excluded.completed_at,
           terminal_at=excluded.terminal_at, result_json=excluded.result_json`,
 params: z.tuple([uuid, text.pipe(scope), text, text.pipe(action), text, status, guaranteeKind, z.number().int().nonnegative().max(2147483647), nullableTimestamp, nullableTimestamp, nullableTimestamp, nullableTimestamp, text]), row: z.object({}), expects: 'none',
});

export const recordAttempt = defineQuery({
 name: 'sessions.recordAttempt',
 text: sql`insert into auth.session_operation_attempts
           (tenant_id, operation_id, attempt_number, outcome, error_code, started_at, completed_at)
         values (current_setting('app.tenant_id')::uuid, $1::uuid, $2, $3, $4, clock_timestamp(), clock_timestamp())
         on conflict (tenant_id, operation_id, attempt_number) do nothing`,
 params: z.tuple([uuid, z.number().int().nonnegative().max(2147483647), status, nullableText]), row: z.object({}), expects: 'none',
});

export const claimPendingOperations = defineQuery({
 name: 'sessions.claimPendingOperations',
 text: sql`with claimed as (
           select tenant_id, operation_id from auth.session_operations
            where state='pending' and (next_attempt_at is null or next_attempt_at <= $1)
              and (lease_until is null or lease_until <= $1)
            order by next_attempt_at nulls first for update skip locked limit $3
         )
         update auth.session_operations o set lease_until=$2
          from claimed c where o.tenant_id=c.tenant_id and o.operation_id=c.operation_id
         returning o.operation_id,o.scope,o.actor_id,o.action,o.request_hash,o.result_json,
                   o.attempt_count,o.next_attempt_at,o.lease_until`,
 params: z.tuple([timestamp, timestamp, z.number().int().nonnegative().max(2147483647)]), row: operationRow, expects: 'many',
});

export const purgeTerminalRegistrations = defineQuery({
 name: 'sessions.purgeTerminalRegistrations',
 text: sql`delete from auth.session_registrations where terminal_at < $1 returning sid`,
 params: z.tuple([timestamp]), row: z.object({ sid: uuid }), expects: 'many',
});

export const purgeTerminalOperations = defineQuery({
 name: 'sessions.purgeTerminalOperations',
 text: sql`delete from auth.session_operations where terminal_at < $1`,
 params: z.tuple([timestamp]), row: z.object({}), expects: 'none',
});

export const eraseSubjectRegistrations = defineQuery({
 name: 'sessions.eraseSubjectRegistrations',
 text: sql`delete from auth.session_registrations where tenant_id=$1::uuid and subject_id=$2 returning sid`,
 params: z.tuple([uuid, text]), row: z.object({ sid: uuid }), expects: 'many',
});

