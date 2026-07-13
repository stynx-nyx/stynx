---
adr_id: ADR-SESSIONS-0001
title: Provider-neutral session inventory and control
status: accepted
date: 2026-07-13
authors: ['Architect']
tags: [stynx, sessions, identity-provider, tenancy, privacy, revocation]
---

# ADR-SESSIONS-0001 — Provider-neutral session inventory and control

**Authority:** Architect (DEVAI Constitution Article 6).
**Contract:** [`docs/framework/contracts/session-control.md`](../../framework/contracts/session-control.md).
**Round:** R21 W06.
**Owner decision:** `ACCEPTED 1D 2C 3D 4B 5D 6B 7C 8B 9C 10B 11C 12C`.

## Status

Accepted on 2026-07-13. This ADR turns every accepted R21 W05 answer into
permanent architecture. It does not reopen provider, privacy, authorization, or
compatibility policy.

## Context

The existing `@stynx-nyx/sessions` package owns STYNX-issued access and refresh
tokens, refresh-family rotation, Redis state, JWT signing, JWKS, and a durable
mirror. `@stynx-nyx/angular-sessions` separately promises inventory,
revoke-one, and revoke-others routes that no backend controller currently owns.
An external identity provider may expose none, some, or all of the identity and
revocation primitives assumed by the issued-session implementation. Exchanging
an external login into a second STYNX token family is not an acceptable
prerequisite for session inventory and control.

## Decision

### Logical identity and scope

The public control unit is a logical STYNX session registration, identified by
an opaque general UUID `sid`. UUID versions are not restricted; UUIDv4, UUIDv7,
and any valid RFC 9562 UUID are accepted for session, tenant, and operation IDs.
The registration links a tenant-scoped view to one provider-session anchor.
The anchor may hold an encrypted/opaque provider control handle or a keyed,
non-secret fingerprint, but never a raw access, ID, or refresh token.

One provider anchor can have multiple tenant registrations. Tenant inventory is
RLS-scoped to one registration and does not reveal sibling registrations.
Removing membership retires only that registration unless the anchor is proven
tenant-dedicated. An operation whose provider effect reaches sibling tenants
must declare that blast radius and requires separately proven identity-global
authority. Tenant scope is the default; identity-global scope is never inferred.

Current-session identity is resolved in order from (1) a verified provider
session claim, (2) an adopter mapping validated by trusted authentication
context, then (3) a registry-issued opaque handle. The third mechanism is
mandatory when the first two are unavailable. A request body, query, or path
may select a target `sid` for revoke-one, but can never assert which session is
current or override tenant, subject, actor, or authority context.

### Package boundary

`@stynx-nyx/sessions` remains the single public package and gains an additive
`./control` export backed by provider-neutral internals. The root barrel may
re-export the stable control facade types and service, but issuance-specific
types remain unchanged. Registry, provider adapter, reconciliation, trusted
context, and HTTP orchestration live in isolated files and have no dependency
on JWT signing, refresh rotation, JWKS, Cognito authentication, or Redis.

Existing create/refresh/exchange/sign/JWKS APIs and runtime behavior remain
compatible. The issued-session implementation may implement the same provider
port through a local adapter, but is not the neutral core. External adopters do
not configure a STYNX issuer and STYNX does not mint a second token family.

R21 ships a deterministic provider fake and Cognito-compatible contract fixture
without the AWS SDK, credentials, network calls, or an official runtime Cognito
adapter. A future official adapter requires a separate ADR covering dependency,
credential, secret-redaction, timeout, retry, and maintenance ownership.

### Lifecycle, actions, and guarantees

Logical registrations use `active`, `revocation_pending`, `revoked`, `failed`,
`unsupported`, `expired`, or `retired`. Provider anchors independently record
`active`, `revocation_pending`, `revoked`, `failed`, `unsupported`, `expired`,
or `unknown`. A registration is never reported `revoked` merely because an
intent was accepted. The normative transition table is in the contract.

Actions have exact meanings: `logout-current` targets the trusted current
registration; `revoke-one` targets one selected registration; `revoke-others`
excludes the current registration; `revoke-all` includes it; administrative
revoke targets an explicitly authorized subject or tenant. Shared-anchor
provider revocation is identity-global even when initiated from one tenant.

Capabilities and guarantees are independent typed values. The configured
guarantee is one of:

- `immediate_local`: denial is committed synchronously before a `revoked`
  response; `effectiveBy` is no later than the response timestamp;
- `bounded_local`: the declared bound defaults to 5 seconds and MUST be between
  1 and 30 seconds; `effectiveBy` is request acceptance plus that bound;
- `refresh_revoked_access_expires`: refresh/control is confirmed, while access
  lasts until the declared provider expiry instant;
- `provider_confirmed`: provider control is confirmed but token enforcement
  timing is not stronger than provider evidence;
- `none`: no invalidation guarantee.

An adapter cannot advertise a stronger guarantee than its enforcement path.
Unsupported capabilities return `unsupported`; unavailable provider work is
persisted as `revocation_pending`. Partial bulk results remain itemized and do
not collapse to success.

Every mutation uses a caller-supplied or server-issued UUID operation ID as its
idempotency key. The unique key is `(scope, actor, action, operation_id)` and a
replay returns the original/resulting operation without repeating effects.
Provider attempts use the same operation ID. Retry is exponential at 5 seconds,
30 seconds, 2 minutes, 10 minutes, 30 minutes, and 2 hours (six attempts after
the initial attempt), with deterministic jitter supplied by the scheduler and
a terminal `failed` state after the final attempt. Manual reconciliation may
resume a failed operation under the same ID and must append a new attempt, not
erase history. STYNX defines the claim/lease/reconcile port; the adopter owns
the scheduler. A worker lease is 60 seconds and attempt recording is atomic.

### Authorization, privacy, and audit

Authorization is deny-by-default and distinguishes `sessions:self`,
`sessions:tenant-manage`, and `sessions:identity-manage`. Self authority covers
only the actor's registrations in trusted tenant context. Tenant authority is
required for another subject or tenant-wide action. Identity authority is
required for identity-global inventory/control and any shared-anchor provider
blast radius. Provider capability is not authorization.

Display metadata is limited to untrusted device label, client/application,
provider label, created/last-seen/expires timestamps, normalized user-agent
family/device class, and country/region location. Raw IP is discarded
immediately after coarse-location derivation. Full user-agent, tokens, provider
handles, fingerprints, credentials, and rejected secret input are not persisted,
logged, audited, or returned. User labels are escaped as untrusted text.

Every control request, attempt, pending transition, result, and failure is
audited. Privileged inventory reads are audited; ordinary self-listing is
audited only when adopter policy requests it. Audit data contains identifiers,
scope, action, capability/guarantee, state, safe error code, attempt number,
blast radius, and timestamps—not tokens, raw IP, full user agent, provider
handles, or metadata values.

Terminal registration, anchor, and operation metadata is retained for 30 days
from its terminal timestamp and then deleted or irreversibly anonymized.
Subject erasure triggers the applicable deletion/anonymization immediately,
subject to independently required redacted audit retention.

### Storage

The reference schema separates `auth.session_provider_anchors`,
`auth.session_registrations`, `auth.session_operations`, and
`auth.session_operation_attempts`. Tenant registrations have forced RLS and all
tenant indexes lead with `tenant_id`. Anchors are not directly tenant-readable;
access is only through a service that proves a visible registration or
identity-global authority. Operations are tenant-RLS scoped unless explicitly
identity-global. Unique constraints protect provider correlation and
idempotency. Exact columns, checks, indexes, retention keys, and trusted context
requirements are normative in the contract.

### HTTP and consumer compatibility

The existing paths remain:

- `GET /auth/sessions`
- `DELETE /auth/sessions/:sid`
- `POST /auth/sessions/revoke-others`

The list response remains a top-level array so existing consumers continue to
parse it. Existing fields remain and new fields are additive. `lastIp` is always
omitted; `userAgent`, when present, is normalized rather than full. Mutation
responses use HTTP 200 with an additive result body; legacy clients expecting
an empty 2xx response continue to succeed because they ignore the body.
Capability discovery is via additive per-item fields and response headers,
including `Stynx-Session-Control-Version: 1`. New `logout-current`,
`revoke-all`, administrative, operation-status, and identity-global routes are
additive and versioned by that contract header, not replacement URLs.

`@stynx-nyx/angular-sessions` receives additive optional fields and result
types. Its existing `list()`, `revoke(sid)`, and `revokeOthers()` calls and URLs
remain source-compatible; adapters normalize legacy arrays and empty mutation
responses. New status-aware methods are additive. The reference API owns real
routes and the reference web stops using session-route mocks after backend
wiring is available.

## Verification contract

W07/W08 must cover every lifecycle transition; same-tenant and cross-tenant RLS
negatives; self, tenant-admin, and identity-admin authorization; current-session
resolution and payload spoofing; revoke-one/others/all and logout-current;
shared-anchor blast radius; capability gaps; every guarantee class and numeric
bound; pending, partial failure, retry, lease recovery, and terminal failure;
concurrent idempotent requests; retention, erasure, and redaction; provider
handle/token log scanning; deterministic Cognito-compatible fake conformance;
and legacy Angular/issued-session compatibility. No fake AWS test may contact a
network or load credentials.

## Consequences

STYNX gains one public session concept without coupling provider control to
token issuance. Some providers cannot deliver immediate invalidation, and the
API exposes that limitation instead of simulating parity. Durable correlation,
operations, and cleanup add storage and scheduler responsibilities. Existing
issued-session and Angular consumers retain their paths and successful behavior.

## Exact W07 implementation checklist

1. Add isolated provider-neutral types, validation, registry/service, provider
   port, idempotent operation engine, retry/reconciliation port, Nest tokens,
   module registration, local issued-session adapter, deterministic fake, and
   Cognito-compatible contract fixture under `packages/sessions/src/control/`.
2. Add `packages/sessions/src/control/index.ts`, package export `./control`, and
   additive stable root exports; do not alter create/refresh/sign/JWKS behavior.
3. Add the reference migration creating the four `auth.session_*` tables,
   forced RLS policies, constraints, tenant-leading indexes, idempotency unique
   key, attempt lease fields, and 30-day cleanup keys.
4. Add real reference API controllers/providers for the three existing paths
   plus status-aware logout-current, revoke-all, operation-status, authorized
   administrative, and identity-global operations from the wire contract.
5. Derive actor, subject, tenant, current session, and authority exclusively
   from trusted auth/tenant context; reject every writable context override.
6. Implement capability negotiation, itemized bulk results, exact state
   transitions, guarantee/effective timing, stable safe error codes, audit
   hooks, retry lease/claim, and redaction. Never persist/log raw tokens, raw IP,
   full user agent, provider handles in tenant rows, or credentials.
7. Extend `@stynx-nyx/angular-sessions` DTOs and adapter additively, preserving
   the legacy methods and top-level list-array/empty-2xx normalization; remove
   reference-web session mocks only after real routes are wired.
8. Add unit, wiring, DB integration, provider-contract, tenant-negative,
   authorization, concurrency/idempotency, retry, privacy/retention, Angular
   contract, and old-consumer compatibility tests enumerated above.
9. Update package docs, OpenAPI generation/coverage, public API baselines,
   tenant-isolation coverage, release consumer fixtures, mutation matrix, and
   package indexes without hand-editing generated evidence.
10. Add a minor changeset for additive `@stynx-nyx/sessions` exports and a minor
    changeset for additive `@stynx-nyx/angular-sessions` APIs. If implementation
    cannot preserve the legacy list array, empty mutation success, or existing
    issuance API, stop and return to Architect; that requires a major change.
