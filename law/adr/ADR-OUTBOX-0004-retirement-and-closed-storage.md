---
adr_id: ADR-OUTBOX-0004
title: Terminal delivery retirement and closed consumer storage bindings
status: accepted
date: 2026-10-10
authors: ['Architect']
tags: [stynx, outbox, retirement, storage, tenancy, rls, minor]
supersedes: ADR-OUTBOX-0003 D5 only; extends D2 and D3 without weakening their guarantees
---

# ADR-OUTBOX-0004 — Terminal delivery retirement and closed consumer storage bindings

## Status

Accepted for the Owner-authorized complete STYNX 1.6.0 minor release and
DETRAN adoption campaign. This records the Owner's decision to implement actual
retirement of existing deliveries. It supersedes only
[ADR-OUTBOX-0003](ADR-OUTBOX-0003-configurable-role-and-consumer-storage.md) D5.
All unamended decisions of ADR-OUTBOX-0002 and ADR-OUTBOX-0003 remain binding.
Acceptance of this specification is not implementation or release evidence.

## Context

STYNX 1.5.7 leaves existing deliveries without a supported terminal disposition
when their entity loses its destination. Removing a destination does not remove
its delivery or release later events in the aggregate. A consumer request to
declare this case inapplicable does not implement the requested behavior.
The accepted D2/D3 consumer-storage commitments also require a closed binding
and live verifier, rather than documentation that assumes platform role names.

## Decision

### D1 — Typed actor-attributed retirement

The additive public operation is:

```ts
retireEvent(
  eventId: string,
  input: OutboxEventRetirementInput,
): Promise<OutboxEventRetirement>;

getEventRetirement(eventId: string): Promise<OutboxEventRetirement | null>;
```

`OutboxEventRetirementInput` is `{ idempotencyKey: string; reason: string }`.
`OutboxEventRetirement` carries `id`, `tenantId`, `eventId`, `idempotencyKey`,
`actorId`, `reason`, `previousStatus` and `retiredAt`. The stored instant is returned
on replay. Tenant and actor come exclusively from the trusted request context and
live application transaction with `requireActor: true`; neither is accepted in
the input. The consumer authorizes this operator action before calling it.
The key is nonempty and at most 255 UTF-8 bytes; the reason is nonblank and at
most 2048 UTF-8 bytes. Malformed identity/input fails before mutation. Another
tenant's event is indistinguishable from an absent event.

In one app-role transaction, lock the tenant delivery row `FOR UPDATE`, verify
the retirement operation fingerprint, insert its immutable receipt and set the
projection to `RETIRED`. The fingerprint binds tenant, event, operation key,
trusted actor and exact reason. Repeating the same operation returns the original
receipt without another transition or history row. Reusing a key for different
content, or retiring the same event with a different operation, fails with a
typed 409. Missing delivery fails with the existing not-found contract.
`OutboxRetirementInputError` has code `OUTBOX_RETIREMENT_INVALID`, status 400.
`OutboxRetirementConflictError` has code `OUTBOX_RETIREMENT_CONFLICT`, status
409, with typed reason `active-lease`, `already-acked`, `operation-conflict`
or `already-retired`. Retry of a retired row retains the existing
`OutboxEventNotFailedError` rather than changing its published error contract.

`ACKED` cannot be retired. A delivery with an unexpired lease cannot be retired,
regardless of its status. Otherwise `PENDING`, `ERROR`, `SENT_UNRESOLVED`, and a
`SENT` delivery whose lease expired are eligible. The live database clock decides
lease expiry while holding the row lock; a caller cannot backdate retirement.
Refusal leaves projection and history unchanged. Claim, ACK and retirement races
serialize on the same delivery row; no check-then-write window is admitted.

### D2 — Terminal semantics, ordering and evidence

`OutboxEventDeliveryStatus` and the delivery status `CHECK` gain `RETIRED`.
It is a terminal operator disposition, not an ACK or proof of provider delivery.
Claims and automatic recovery never select it. `retryEvent` refuses it without
changing evidence. Both `ACKED` and `RETIRED` release the aggregate predecessor
blocker; later eligible events may proceed in their original order.

Late verified ACKs or dispatch completion/failure retain their actual evidence
in the existing ledgers, but never revive a retired projection, schedule a retry,
or rewrite retirement provenance. No provider request or successful ACK is
fabricated. Retirement itself creates no transport attempt and does not increment
`attempts`. Event log rows, earlier attempts, ACKs and legacy evidence are intact.
SSE replay continues to expose the immutable original event; retirement does not
erase a fact or change its cursor.

Delivery listings and aggregate views expose the status and retirement receipt
through additive typed reads. `OutboxEventDeliveryState.retirement` is optional
and carries the exact stored `OutboxEventRetirement`; nonretired/historical rows
do not fabricate it. `getEventRetirement` returns null for malformed, missing,
other-tenant or never-retired events, matching existing delivery read privacy.
`retiredAt` is a `Date`, like the delivery's `updatedAt`; `previousStatus` excludes
`ACKED` and `RETIRED`. Existing status filters accept `RETIRED`.
`byStatus` and aggregate counts include it, and `total` still counts all delivery
rows. Outstanding age and the aggregate head exclude both terminal states.
Health must distinguish retired totals from pending/error backlog; a retired
delivery cannot make an outstanding queue look older or imply successful delivery.
Destination and entity filters keep their existing semantics. No matching
destination is required to retire an existing delivery.

### D3 — Forward migration and privileges

Use the next free forward platform migration, `0026` at this checkpoint, to
widen the delivery status constraint and add `outbox.event_retirements` with:

- Tenant-leading composite event FK to `outbox.events(tenant_id,id)`.
- Non-null receipt identity, operation key, trusted actor, reason, prior status
  and retirement instant; the published input bounds are database constraints.
- Uniqueness of `(tenant_id,idempotency_key)` and `(tenant_id,event_id)`.
- Enabled and forced RLS with the same trusted SQL tenant boundary.
- App-role `SELECT` and `INSERT` only, no `UPDATE` or `DELETE`; a mutation guard
  also rejects update/delete by maintenance roles. Reader access is read-only.

The transition and receipt insert commit or roll back together. Update the
canonical DDL, seeds, standalone objects/role-bindings and closed manifest with
this migration. All historical migrations and observation artifacts remain
byte-preserved. The declared status/output union widening ships in the 1.6.0
minor changeset, package history and upgrade guide; exhaustive consumers must
handle `RETIRED` before upgrading.

### D4 — Closed storage binding and verifier

ADR-OUTBOX-0003 D2/D3 are required release deliverables. The deterministic
standalone renderer separates outbox objects from role bindings and accepts only
validated PostgreSQL identifiers: owner role, application role, optional reader
role and tenant-table schema/table/UUID-key column. The schema `outbox` stays
fixed. No arbitrary SQL fragment, schema substitution or audit-schema rewrite
is admitted. Reapplication preserves rows and existing evidence.

The versioned manifest is a closed inventory of relations, columns/types,
constraints, indexes, functions/triggers, sequence, FORCE RLS, policies and
minimum grants, including retirement and the marker/clock/legacy dependencies.
It declares non-relational dependencies separately. Generated bytes must agree
with the current forward migration chain, and all runtime SQL references must
be accounted for. A catalog/equivalence test compares a platform install with a
default-rendered install and a nondefault tenant/role installation.

The live verifier runs read-only as the configured owner and reports package
and contract versions, binding identity, and each check's identity, object,
tenant where relevant, expected/observed value and reason. Supported mode
requires every mandatory check to pass; missing, unreadable or unknown checks
fail closed with nonzero exit. It verifies the actual configured role and its
membership/ownership boundary, least grants, policies, constraints, triggers,
FORCE RLS and stored-row invariants. Default roles receive the same checks.
It neither repairs data nor grants privileges. Consumer-owned mode continues
to make no claim about the consumer's audit-chain linearization; custom legacy
cutover remains unsupported under this record.

Role verification includes every parent capability reachable through PostgreSQL
`MEMBER`, including roles reachable by `SET ROLE` despite `NOINHERIT`. Applicable
parent/PUBLIC policies and effective privileges cannot bypass the configured
app/reader boundary; neither role may obtain `WITH GRANT OPTION`. The owner
must have full row visibility (`row_security_active` false) before stored-row
checks. Declared foreign keys must have enabled enforcement triggers, and an
orphan scan must independently confirm their stored-row invariants. A validated
constraint definition alone is insufficient. The ownership singleton, legacy
mapping/generation, migrated delivery and ACK tenant identities must agree.

For D3's transferred cursor invariant in ADR-OUTBOX-0003, clock-at-least-max is
necessary but not sufficient when a transferred row ties the next append instant.
Stored event timestamps must be finite and have millisecond precision. Each
tenant clock must cover its greatest event instant and remain in the runtime's
unsigned 48-bit millisecond range. Let `t_next` be the greater of that clock and
the live wall clock floored to milliseconds, and `n_next` the next available
global sequence value, accounting for `is_called` without advancing it. The
runtime `outbox.event_uuid(t_next, n_next)` must sort strictly after every stored
event ID whose timestamp equals `t_next`; the sequence must not be exhausted.
This check concerns the public `(createdAt, id)` order, not a requirement to
rewrite historical IDs as UUIDv7. An arbitrary historical UUID is admissible
when `t_next` is later than its timestamp. A future-dated imported row at the
prospective instant remains unsupported until its tied ID ordering is safe or
the actual wall clock advances beyond it. Verification never rewrites a fact,
advances a sequence or fabricates a later clock to obtain a pass.

`OutboxModuleOptions.storageMode?: 'platform' | 'consumer-owned'` defaults to
`platform`. Explicit consumer-owned mode refuses `cutoverLegacyMessages()`
before any transaction/SQL with `OutboxConsumerStorageCutoverUnsupportedError`,
code `OUTBOX_CONSUMER_STORAGE_CUTOVER_UNSUPPORTED`, status 409 and typed reason
`consumer-owned-storage`. In platform/omitted mode, a safe metadata probe using
`to_regprocedure('audit.fn_row_change()')` verifies the audit dependency before
marker locks, domain SQL or mutation. Absence yields the same typed error with
reason `audit-chain-unavailable`, never an unchecked `regprocedure` cast error.
An option is not proof that the function exists. Any cached capability is bound
to the exact live database/session identity and cannot outlive a changed binding;
a dependency removed after the probe still refuses typed without partial
cutover. Existing custom-table refusal and platform cutover guarantees remain.

## Verification obligations

Inspector proves retirement idempotence and conflicting reuse, trusted actor
attribution, two-tenant invisibility, active-lease/ACKED refusal, claim/ACK/late
completion races, immutable history, later aggregate unblocking, retry refusal
and truthful queue health on real PostgreSQL under a restricted app role.
Test empty installation and populated 1.5.7 upgrade; old rows keep all prior
values. The app cannot modify/delete history. Storage verifier negative cases
include missing object/constraint/policy, lost FORCE RLS, excess grant,
application ownership or inherited owner capability and schema drift.

## Consequences

Engineer implements only after this contract checkpoint; Inspector independently
authors the regressions. Architect binds intended emitted API and assertion
projections after those changes. Neither a passing specification nor an actor's
retirement action claims external delivery success.
