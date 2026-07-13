# Session Control Contract v1

**Authority:** Architect (DEVAI Constitution Article 6).
**Decision:** [ADR-SESSIONS-0001](../../meta/adr/ADR-SESSIONS-0001-provider-neutral-session-control.md).
**Target:** additive `@stynx-nyx/sessions/control` and
`@stynx-nyx/angular-sessions` surfaces.

This is the normative provider-neutral R21 contract. MUST, MUST NOT, SHOULD,
and MAY are requirements for implementations and adapters.

## Types and capability model

```ts
type SessionScope = 'tenant' | 'identity';
type SessionAction =
  | 'logout-current'
  | 'revoke-one'
  | 'revoke-others'
  | 'revoke-all'
  | 'revoke-subject'
  | 'revoke-tenant';
type RegistrationState =
  | 'active'
  | 'revocation_pending'
  | 'revoked'
  | 'failed'
  | 'unsupported'
  | 'expired'
  | 'retired';
type ProviderState =
  | 'active'
  | 'revocation_pending'
  | 'revoked'
  | 'failed'
  | 'unsupported'
  | 'expired'
  | 'unknown';
type MutationStatus = 'pending' | 'revoked' | 'unsupported' | 'failed';
type InvalidationGuarantee =
  | 'immediate_local'
  | 'bounded_local'
  | 'refresh_revoked_access_expires'
  | 'provider_confirmed'
  | 'none';

interface SessionControlCapabilities {
  stableSessionIdentity: boolean;
  listScopes: readonly SessionScope[];
  controlScopes: readonly SessionScope[];
  revokeOne: boolean;
  revokeOthers: boolean;
  revokeAll: boolean;
  localEnforcement: 'immediate' | 'bounded' | 'none';
  providerConfirmation: boolean;
  retryReconciliation: boolean;
  identityGlobalAuthority: boolean;
  sharedAnchorBlastRadius: boolean;
}

interface SessionGuarantee {
  kind: InvalidationGuarantee;
  effectiveBy: string | null; // RFC 3339 UTC
  propagationBoundSeconds: number | null;
  accessTokenExpiresAt: string | null;
}
```

Capabilities are orthogonal. `false` or `none` MUST yield `unsupported` or a
weaker guarantee, never emulation. `immediate_local` is committed before the
response. `bounded_local` defaults to 5 seconds and MUST be configured from 1
through 30 seconds inclusive. `refresh_revoked_access_expires` MUST provide
`accessTokenExpiresAt`; `none` has no `effectiveBy`. Provider confirmation does
not imply access-token denial.

## Trusted identity and ports

```ts
interface TrustedSessionContext {
  actorId: string;
  subjectId: string;
  tenantId: string; // general RFC 9562 UUID; no UUID-version restriction
  currentSessionId: string;
  authorities: ReadonlySet<'sessions:self' | 'sessions:tenant-manage' | 'sessions:identity-manage'>;
  requestId: string;
}

interface SessionProviderAdapter {
  readonly provider: string;
  capabilities(context: ProviderCapabilityContext): Promise<SessionControlCapabilities>;
  correlate(input: ProviderCorrelationInput): Promise<ProviderCorrelationResult>;
  revoke(input: ProviderRevocationRequest): Promise<ProviderRevocationResult>;
  inspect?(input: ProviderInspectionRequest): Promise<ProviderInspectionResult>;
}

interface SessionRegistry {
  list(context: TrustedSessionContext, query: SessionInventoryQuery): Promise<SessionView[]>;
  resolveCurrent(context: TrustedSessionContext): Promise<SessionRegistration>;
  register(input: TrustedRegistrationInput): Promise<SessionRegistration>;
  retire(input: TrustedRetirementInput): Promise<SessionRegistration>;
  beginOperation(input: BeginSessionOperation): Promise<SessionOperation>;
  claimPending(input: ReconciliationClaim): Promise<SessionOperation[]>;
  appendAttempt(input: SessionOperationAttempt): Promise<void>;
  completeOperation(input: CompleteSessionOperation): Promise<SessionOperation>;
  purgeTerminal(before: string): Promise<RetentionResult>;
  eraseSubject(input: TrustedSubjectErasure): Promise<RetentionResult>;
}

interface SessionControlService {
  list(context: TrustedSessionContext, query?: SessionInventoryQuery): Promise<SessionView[]>;
  execute(
    context: TrustedSessionContext,
    command: SessionControlCommand,
  ): Promise<SessionMutationResult>;
  getOperation(context: TrustedSessionContext, operationId: string): Promise<SessionMutationResult>;
  reconcile(worker: SessionReconciliationWorker): Promise<ReconciliationResult>;
}
```

Port input types MUST contain normalized opaque handles/fingerprints, not raw
tokens. Adapters MAY use a token transiently inside the authentication boundary
to derive a non-secret fingerprint, but the token MUST NOT be placed in a port
DTO, persisted, audited, or logged. Provider handles are encrypted or keyed at
rest and never appear in tenant-visible rows or wire DTOs.

Current-session resolution order is verified provider claim, validated adopter
mapping, then mandatory registry handle. Context is produced by trusted guards.
Body/query fields named `tenantId`, `subjectId`, `actorId`, `currentSessionId`,
or authority equivalents are `SESSION_CONTEXT_OVERRIDE` (400). The `:sid` path
selects only the revoke-one target.

## Authorization

| Operation                                                  | Required authority                                                 |
| ---------------------------------------------------------- | ------------------------------------------------------------------ |
| own tenant list/control                                    | `sessions:self` and actor equals subject                           |
| another subject or tenant-wide list/control                | `sessions:tenant-manage` in trusted tenant                         |
| identity-global list/control                               | `sessions:identity-manage` plus proven provider/adopter capability |
| any provider action affecting sibling tenant registrations | `sessions:identity-manage`                                         |

Missing authentication is 401. Missing authority is 403. Cross-tenant targets
MUST appear absent (404) to tenant-scoped callers. Provider capability never
grants caller authority.

## State machine and operations

Allowed registration transitions are:

```text
active -> revocation_pending | revoked | unsupported | expired | retired
revocation_pending -> revoked | failed | unsupported | expired
failed -> revocation_pending (explicit reconcile, same operation id)
active | revocation_pending -> retired (tenant-registration retirement only)
```

Terminal states are `revoked`, `unsupported`, `expired`, and `retired`;
`failed` is retry-terminal but manually reconcilable. No other transition is
valid. Provider anchor transitions follow the same revocation path but use
`unknown` instead of `retired`. A tenant registration MUST NOT copy a provider
`revoked` state until provider confirmation or the declared local guarantee is
actually satisfied.

`logout-current` and `revoke-one` target exactly one registration.
`revoke-others` targets all visible active registrations except trusted
`currentSessionId`. `revoke-all` includes current. Subject/tenant administrative
actions select only the authorized scope. Bulk responses contain one result per
target and an aggregate `pending`, `revoked`, `unsupported`, or `failed` status;
the aggregate is `revoked` only when all targets are revoked.

Every command has a UUID `operationId`. `(scope, actor, action, operationId)` is
unique. An identical replay returns the existing operation. Reuse with different
normalized parameters is `SESSION_IDEMPOTENCY_CONFLICT` (409). The provider
receives the same operation ID. Concurrent claims use an atomic 60-second lease.

Initial provider failure persists `revocation_pending`. Retry delays after the
initial attempt are 5 seconds, 30 seconds, 2 minutes, 10 minutes, 30 minutes,
and 2 hours. Scheduler jitter MUST NOT exceed 20% and MUST be deterministic for
an operation ID. After six retries the operation becomes `failed`. Attempt
number, safe result/error, and timestamps are append-only and atomic with state
changes. Adopters run scheduling; STYNX owns claim/reconcile semantics.

## Wire contract

All responses include `Stynx-Session-Control-Version: 1` and
`Cache-Control: no-store`.

```ts
interface SessionView {
  sid: string;
  sessionId?: string; // compatibility alias equal to sid
  tenantId: string;
  createdAt: string;
  expiresAt: string | null;
  lastSeenAt: string | null;
  current: boolean;
  scope: SessionScope;
  state: RegistrationState;
  provider: string;
  client: string | null;
  deviceLabel: string | null;
  userAgent: { family: string | null; deviceClass: string | null } | null;
  location: { countryCode: string | null; region: string | null } | null;
  capabilities: SessionControlCapabilities;
  guarantee: SessionGuarantee;
  blastRadius: 'registration' | 'tenant' | 'identity';
}

interface SessionMutationResult {
  operationId: string;
  action: SessionAction;
  status: MutationStatus;
  guarantee: SessionGuarantee;
  acceptedAt: string;
  completedAt: string | null;
  targets: Array<{
    sid: string;
    status: MutationStatus;
    guarantee: SessionGuarantee;
    errorCode: string | null;
  }>;
}
```

`GET /auth/sessions` returns the top-level `SessionView[]` array for backward
compatibility. New fields are additive. It MUST omit `lastIp`; a legacy
`userAgent` string, if a transitional serializer emits it, MUST contain only a
normalized family and MUST be removed in the next major version.

`DELETE /auth/sessions/:sid` implements revoke-one and returns 200 with
`SessionMutationResult`. `POST /auth/sessions/revoke-others` implements exact
exclusion and returns 200. Existing clients that discard an empty 2xx body must
also accept the additive body; the Angular adapter MUST normalize both.

Additive routes are `POST /auth/sessions/logout-current`, `POST
/auth/sessions/revoke-all`, `GET /auth/session-operations/:operationId`, and
explicit administrative routes under `/auth/session-administration/*`.
Identity-global requests MUST opt in with `scope: "identity"`, be independently
authorized, and receive declared blast radius. These route bodies cannot carry
tenant, actor, subject, or current-session context; administrative target
subject/tenant selectors are accepted only by the guarded administrative DTOs.

Stable errors use the repository envelope:

| Code                             | HTTP | Meaning                                          |
| -------------------------------- | ---: | ------------------------------------------------ |
| `SESSION_INVALID`                |  400 | malformed UUID/action/body                       |
| `SESSION_CONTEXT_OVERRIDE`       |  400 | writable trusted-context field                   |
| `SESSION_UNAUTHENTICATED`        |  401 | trusted auth context absent                      |
| `SESSION_FORBIDDEN`              |  403 | authority absent or blast radius forbidden       |
| `SESSION_NOT_FOUND`              |  404 | invisible/missing target or operation            |
| `SESSION_IDEMPOTENCY_CONFLICT`   |  409 | operation ID reused with other input             |
| `SESSION_CAPABILITY_UNSUPPORTED` |  422 | requested provider capability absent             |
| `SESSION_OPERATION_PENDING`      |  202 | accepted asynchronous operation                  |
| `SESSION_PROVIDER_FAILED`        |  503 | terminal provider failure on synchronous request |

A pending mutation may return HTTP 202 with the normal result body. Unsupported
and failed outcomes MUST preserve the typed body and safe error code; they must
never serialize as revoked.

## Reference storage contract

The migration creates:

- `auth.session_provider_anchors`: UUID PK, provider, encrypted handle or keyed
  fingerprint (mutually exclusive), provider subject key, provider state,
  capabilities JSON constrained to the closed schema, created/last-seen/expires/
  terminal timestamps; unique provider correlation; no tenant RLS exposure.
- `auth.session_registrations`: UUID `sid` PK, anchor FK, UUID tenant ID,
  opaque subject ID (1..255 bytes), state, safe display metadata, guarantee,
  blast radius, created/last-seen/expires/terminal timestamps; forced RLS.
- `auth.session_operations`: UUID operation ID, scope, tenant/actor/subject,
  action, normalized request hash, state, guarantee, attempt counters,
  next-attempt/lease/completed/terminal timestamps; forced tenant RLS except a
  separately guarded identity-global service path.
- `auth.session_operation_attempts`: operation FK plus attempt number, safe
  outcome/error, started/completed timestamps; append-only and reachable only
  through the authorized operation.

Checks enforce closed enums, metadata byte limits, mutually exclusive handle
storage, nonnegative attempt counts, and guarantee-required timestamps/bounds.
Every tenant query index starts with `tenant_id`; required indexes are
`(tenant_id, subject_id, state, last_seen_at DESC)`, `(tenant_id, sid)`, and
`(tenant_id, terminal_at)`. Operations have unique `(scope, actor_id, action,
operation_id)` and indexes for `(tenant_id, state, next_attempt_at)` and lease
expiry. Anchor correlation uses a keyed provider fingerprint unique within
`(provider, provider_subject_key)`; plaintext handles are forbidden.

RLS is enabled and forced. Tenant policies compare `tenant_id` to
`NULLIF(current_setting('app.tenant_id', true), '')::uuid` in `USING` and
`WITH CHECK`. Actor/subject/authority checks remain service/guard obligations;
RLS is defense in depth, not their replacement. Anchors are read only by a
security-definer-free service query reached from an RLS-visible registration or
by a separately authenticated identity-admin connection policy. No unscoped
public registry method exists.

Terminal metadata is deleted or irreversibly anonymized 30 days after
`terminal_at`; cleanup is idempotent. Subject erasure runs immediately for
registrations/anchors that can no longer be safely shared and anonymizes
required audit references. Raw IP is discarded after coarse location derivation.
Full user agent, tokens, provider handles, credentials, and rejected values are
never stored in these tables.

## Audit and verification

Audit every control request, attempt, transition, result, and failure, and every
privileged inventory read. Safe metadata is operation/session/tenant/subject/
actor IDs, action, scope, capability, guarantee, state, attempt, blast radius,
safe error code, and timestamps. Ordinary self-list audit is adopter policy.

Required tests include transition tables; same/cross-tenant RLS; three authority
levels; spoofed context; current-session fallback order; one/others/all/current;
shared anchors; all capability/guarantee combinations and 1/5/30-second bounds;
partial bulk results; retry schedule, deterministic jitter, leases and recovery;
concurrent idempotency; terminal cleanup and erasure; metadata/token/handle/log
redaction; general UUID versions; deterministic Cognito-compatible fake; no AWS
SDK/network/credentials; unchanged issued-session create/refresh/sign/JWKS; and
legacy Angular array plus empty-2xx normalization.
