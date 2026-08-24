---
adr_id: ADR-OUTBOX-0001
title: Transactional outbox promoted from pec (E3)
status: accepted
date: 2026-08-24
authors: ['Architect']
tags: [stynx, outbox, e3, tenancy, integration, promotion]
---

# ADR-OUTBOX-0001 — Transactional outbox promoted from pec (E3)

**Status:** Accepted architecture decision.
**Contract:** [`docs/framework/contracts/outbox-api.md`](../../docs/framework/contracts/outbox-api.md).
**Spec:** STYNX-SPEC-v0.6 §24, E3 — "Transactional outbox; per-(tenant, aggregate) ordering."
**Provenance:** promotion, not a green-field design — see "Source" below.

## Status

Accepted as part of the DETRAN program's Phase 1 stynx platform round (worker
W1.2). This ADR turns pec's proven `integration.renach_outbox` implementation
into the public `@stynx-nyx/outbox` package and records every deviation from
the source.

## Source

- `pec/domain/transmissions-detran-transmissions/api/src/transmissions/transmissions.service.ts`
  — `enqueue`, `ack`, `retry`, `dispatchDue` (CTE + `FOR UPDATE SKIP LOCKED`
  claim), PENDING→SENT→ACKED|ERROR lifecycle.
- `pec/database/ddl/03-integration.sql` — `integration.renach_outbox` /
  `integration.renach_acks` DDL, unique `(tenant_id, entity, entity_id)` and
  `(tenant_id, idempotency_key)`.
- `pec/domain/shared/api/src/webhook-signature.ts` — HMAC-SHA256 ACK body
  signature, and the `@Public()` ack-endpoint pattern in
  `transmissions.controller.ts`.

## Context

pec's outbox is the only proven transactional-outbox implementation in the
portfolio: same-transaction enqueue alongside a domain write, an atomic
claim step immune to double-dispatch under concurrent workers, and an
HMAC-verified inbound ACK route. It is also PEC-specific in three ways that
block reuse: the entity/payload shape is generic already, but (1) enqueue
always opens its own transaction rather than composing into a caller's, (2)
the retry interval is a hardcoded `now() + interval '15 minutes'` with no
policy seam, and (3) `dispatchDue` claims and marks `SENT` but never actually
calls anything — pec left the real HTTP dispatch unwired (confirmed: no
caller of `TransmissionsService.dispatchDue` exists in the pec repo today).
This ADR promotes the proven parts as-is and closes the three gaps above so
other domains (RAIT's `defesas`/`penalidades`/`recursos`/`julgamento`, PORTAL,
BOAT/`est`) can adopt one shared package instead of re-deriving pec's SQL.

## Decision

### Same-transaction `enqueue`

`OutboxService.enqueue(trx, envelope)` takes a caller-supplied SQL executor
(a `@stynx-nyx/data` `Transaction`, or any object exposing a compatible
`query()` — the same duck-typed seam `@stynx-nyx/idempotency`'s
`PgIdempotencyStore` already uses) instead of opening its own transaction.
A domain service composes it inside its own `database.tx(async (trx) => {
...domain write via trx...; await outbox.enqueue(trx, envelope); })` and gets
one atomic commit. `tenant_id` is read server-side from the active
`app.tenant_id` session GUC (the same value RLS checks), not threaded through
application code, so the row can never be enqueued under a tenant the
transaction isn't already scoped to.

### Entity-agnostic envelope

`OutboxEnvelope` drops pec's hardcoded `encounterId` FK column in favor of a
free-form `metadata: Record<string, unknown> | null` jsonb sidecar, not
interpreted by this package. `entity` / `entityId` / `payload` are unchanged
in spirit from pec.

### Claim-and-dispatch, not claim-only

`dispatchDue(limit)` reproduces pec's CTE + `FOR UPDATE SKIP LOCKED` claim
verbatim (same query shape, same `PENDING`/`ERROR` + due-time predicate, same
`SENT` transition), then — the part pec never wired — hands each claimed row
to an injected `OutboxDispatcherPort` when one is configured. A dispatch
failure reverts that row to `ERROR` and schedules its next attempt through
the backoff policy; a missing dispatcher config leaves `dispatchDue`
behaviorally identical to pec's (claim + mark `SENT`, no send), so pec's
current usage pattern still has a drop-in home. `dispatchDue` is a plain
`@Injectable()` method with no dependency on `@stynx-nyx/jobs` or any other
scheduler — either that package's worker runtime or an app-level poller can
drive it on an interval (per spec §24 E2/E3 sequencing and G-013 in the
porting pack: v1.0 ships no job runner).

### Claim scope: cross-tenant, not single-tenant

pec's `dispatchDue` filtered `WHERE tenant_id = auth.current_tenant()` — it
runs once per authenticated tenant context. A platform-shared outbox has to
support one scheduler sweep draining every tenant, so this package's claim
runs under `withSystemContext` + `role: 'owner'` (RLS-bypassing) without a
tenant filter, ordered by `created_at` globally. This satisfies the spec's
"per-(tenant, aggregate) ordering" note at the aggregate level — rows for the
same `(tenant, entity, entityId)` are strictly FIFO because at most one row
exists per aggregate (see "Known limitation" below) — without requiring a
per-tenant sweep loop at the call site.

### Pluggable dispatcher port; HTTP shipped, EventBridge deferred

`OutboxDispatcherPort` is `{ send(row): Promise<void> }`. `HttpOutboxDispatcher`
is the only shipped implementation — a thin `fetch` wrapper with a timeout,
no built-in retry/circuit-breaker (that's `dispatchDue`'s job at the
claim/backoff layer; an app wanting per-call resilience wraps `fetchImpl`
with `@stynx-nyx/integration-adapter`). No EventBridge implementation ships;
the port is the seam a later package hangs one on, per the task's explicit
scope ("leave the port, don't build EventBridge").

### Configurable backoff, pec-compatible default

`OutboxBackoffPolicy.nextAttemptAt(attempt, now)` replaces pec's hardcoded
`now() + interval '15 minutes'`. The module's default,
`FixedIntervalBackoffPolicy(15 * 60_000)`, reproduces pec's behavior exactly
so adopting this package with no configuration changes nothing observable.
`ExponentialBackoffPolicy` (base/factor/cap/jitter) is offered for domains
that want it.

### Inbound ACK verification, promoted and renamed

`verifyOutboxAckSignature(secret, rawBody, header)` is pec's
`verifyWebhookSignature` verbatim (HMAC-SHA256, `sha256=<hex>` header,
constant-time compare), renamed for the generic package and given a paired
`signOutboxAckPayload` test helper. This package does not ship a controller
or `@Public()` guard — those stay app-owned (permission decorators, request
typing, and the `@Public()` metadata key are platform/app concerns this
package has no opinion on) — but the contract doc specifies the exact
pattern an app should wire, matching pec's `transmissions.controller.ts`
`ack` route 1:1.

### ACK resolution: fixed gap from pec

pec's `ack` route is `@Public()` (no tenant context) and matches purely on
`WHERE entity = $1 AND entity_id = $2` with no tenant qualifier — which only
works because pec runs effectively single-tenant against DETRAN. A shared
package cannot assume `entityId` is globally unique across tenants.
`OutboxService.ack()` accepts an optional `tenantId` to disambiguate (an app
can have the external system echo one back as a correlation field); if
`(entity, entityId)` matches rows in more than one tenant without a supplied
`tenantId`, `ack()` throws `OutboxAmbiguousAckError` (409) instead of
guessing at pec's ambient behavior. Like the claim step, `ack()` runs under
`withSystemContext` + `role: 'owner'`, since an inbound webhook has no
authenticated tenant context to begin with.

### Enqueue upsert semantics unchanged from pec

On a repeat `enqueue()` for the same `(tenant, entity, entityId)`, only
`idempotency_key` and `updated_at` are touched — `payload` is **not**
refreshed, matching pec's `ON CONFLICT ... DO UPDATE SET updated_at = now(),
idempotency_key = excluded.idempotency_key` exactly. This is a real
constraint carried over unmodified: re-enqueuing an aggregate whose message
is still `PENDING` does not let a caller replace its payload. Flagged here
rather than silently changed, since altering it changes at-most-once
semantics for domains built directly on pec's original table.

### Known limitation: one outstanding message per aggregate

Both pec and this package enforce `UNIQUE (tenant_id, entity, entityId)` —
at most one outbox row per aggregate. This means "per-(tenant, aggregate)
ordering" from the spec is trivially satisfied (there's only ever one message
in flight per aggregate) rather than solved for the general case of an
append-only per-aggregate event log with many in-flight messages. A domain
needing multiple ordered outbox events per aggregate (e.g. a full event
sourcing feed) is out of scope here; that would need a different unique key
shape and is deferred to a follow-up ADR if a Phase 3+ domain needs it.

## Consequences

- RAIT (`domains/inf/{defesas,penalidades,recursos,julgamento}`), PORTAL's
  appeal submission, and BOAT/`est`'s RENAEST publish path can all enqueue
  through one shared package instead of re-deriving pec's SQL per domain.
- pec's Phase 6 adoption (W6.2) can retire `integration.renach_outbox` /
  `TransmissionsService` in favor of this package once its DDL is migrated;
  see the checklist below for exactly what changes.
- The cross-tenant claim scope means a consuming app's dispatch loop no
  longer needs a per-tenant iteration wrapper — one `dispatchDue()` call
  drains the whole platform — but it does mean the claim step always runs
  with RLS bypassed; `enqueue`/`getOne` remain tenant-scoped and RLS-enforced.
- Domains that need more than one in-flight message per aggregate cannot use
  this package as-is (see "Known limitation").

## pec Phase-6 adoption checklist (W6.2)

1. Replace `TransmissionsService.enqueue(...)` call sites with
   `outboxService.enqueue(trx, { entity, entityId, payload, metadata })`
   composed inside the existing domain transaction.
2. Point `OutboxModuleOptions.table` / `ackTable` at
   `integration.renach_outbox` / `integration.renach_acks` during migration,
   or run a data migration onto `outbox.messages` / `outbox.acknowledgements`
   and drop the `integration.*` tables once parity is confirmed.
3. Replace the `ack` controller's direct `TransmissionsService.ack(...)` call
   with `outboxService.ack({ entity, entityId, status, detail })`; keep the
   `@Public()` route and `verifyWebhookSignature` call, swapping it for
   `verifyOutboxAckSignature` (identical signature).
4. Wire a `HttpOutboxDispatcher` (or a DETRAN-specific `OutboxDispatcherPort`)
   into `StynxOutboxModule.forRoot(...)` so `dispatchDue()` actually sends —
   closing the gap pec never wired.
5. Keep `FixedIntervalBackoffPolicy(15 * 60_000)` (the default) unless pec
   wants to move to exponential backoff; behavior is unchanged either way.
6. Add the `@Audit` decorator on the app-owned enqueue/ack controller
   routes, same as pec does today — this package does not persist audit
   events on the outbox table itself (matching `core.idempotency_keys` /
   `core.rate_limit_overrides` precedent: high-churn operational tables are
   `@no_soft_delete` and not row-audited; audit happens at the operation
   layer, which stays app-owned).
