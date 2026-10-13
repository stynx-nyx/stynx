---
adr_id: ADR-MOBILE-OFFLINE-0005
title: Additive offline acceptance context, resolution events and reconciliation history
status: accepted
date: 2026-10-12
authors: ['Architect']
tags: [offline-sync, compatibility, evidence, tenancy, patch]
---

# ADR-MOBILE-OFFLINE-0005 — Offline acceptance evidence

## Authority and scope

The Owner authorized the 1.6.1 plan on 2026-10-12: repair offline-sync gaps and
evidence collection first, improve as many audit cells as practical, execute no
k6 or mutation tests, and continue DETRAN adoption in parallel. This decision
specifies corrections of the published issue #317 V-check gaps. It is not a
claim of implementation, publication, consumer acceptance or a green scorecard.
Architect, Inspector, Engineer and Auditor retain separate sessions.

Apply these additive contracts to CTG9. Preserve E6, existing call signatures,
HTTP routes/status/envelopes, numbering limits, canonical-only application,
independent item transactions, trusted tenant/audit actor, immutable history and
byte-exact closed-batch replay. Existing 0001–0008 migrations are immutable.
The 1.6.0 verification map remains a historical description; new evidence must
identify the actual 1.6.1 candidate and installed package.

## D1 — Structured sequence and domain-error context (V-03/V-04)

Sequence reuse keeps 409 `OFFLINE_SYNC_BATCH_CONFLICT`; a skipped sequence keeps
422 `OFFLINE_SYNC_BATCH_SEQUENCE`. Both errors add optional public `context`
with exact fields `expectedSequence`, `receivedSequence` and `deviceBatchId`.
Expected sequence is the next sequence from the same trusted tenant/device's
committed history. Keep existing messages and replay-conflict behavior. Add the
context constructor argument after existing arguments; no caller is broken.
A transport adapter preserves its own published envelope while mapping this data.

A domain rejection retains its existing code/status classification. Copy the
error's own `context`, or `HttpException.getResponse().context` when present
(the response has precedence), into the receipt's consumer `context`. The
context must be a plain legal JSON object, at most 4096 UTF-8 bytes, without the
reserved top-level `stynx` key. Do not invoke accessors/coercion/toJSON, silently
drop values, fabricate context or overwrite platform evidence. Existing typed
numbering outcomes retain their authoritative context and conflict behavior.
Invalid supplied domain context is a retryable item failure, recorded as
`OFFLINE_SYNC_DOMAIN_CONTEXT_INVALID` after full item rollback; the batch stays
open and no domain, numbering or event effect commits. Historical receipts and
responses are never reconstructed from a newer exception or policy.

## D2 — Structured missing-window signal and returned receipt context (V-05/V-07)

Add optional `OfflineSyncStynxContext.signals`, a readonly array of records with
`code: 'SYNC_CONCURRENCY_WINDOW_SOURCE_PENDING'`. Produce it when a configured
policy resolver and legacy post-apply detector have no window source
(`undefined` or `null`). Explicit zero disables detection deliberately. Preserve
the legacy warning behavior, and neither invent a window nor execute the disabled
detector. The signal reports an observation gap, not suspicion or permission to
apply. Persist it in the corresponding receipt/attempt platform context and
return it on new submissions, lookups and listings. Replays preserve the original
signal; a changed policy does not rewrite old evidence.

Populate the already-optional `SyncItemReceipt.stynx` on new submit responses
from the same persisted platform context used by lookups/listings. It includes
only facts the path actually produced. Cross-batch duplicate receipt context
retains the original receipt/application identity. An archived or closed response
keeps its original bytes and may lack this field. Consumers must continue to use
lookups/listings when a historical response did not contain a field.

## D3 — Explicit business-agent candidate (V-10)

CTG9 reserve and submit inputs add optional `agentId`, a nonblank string of
1–255 UTF-8 bytes. It is a candidate business identity, never a trusted actor or
tenant. `OfflineSyncAgentResolver.resolve(scope, operation, request?)` adds the
optional third argument `{ agentId: string }`. Pass the third argument only when
the input supplied a candidate; otherwise preserve the exact two-argument call.
Existing two-argument implementations remain valid. The host resolver verifies
association/permission and returns the effective business agent; validate that
return before any write. A supplied candidate without a resolver is a typed
configuration refusal, never an actor fallback. Without a supplied candidate,
existing resolver/actor fallback behavior remains.

Persist the effective agent independently of `scope.actorId`, which remains the
trusted audit actor. No input can replace `scope.tenantId`, audit actor or resolver
authority. Bind a supplied candidate into newly created durable request identity
so a changed candidate cannot reuse a key as the same request. Absence retains
legacy fingerprints and exact historical replay. A host maps DETRAN `agent_id`
without changing its public route or envelope.

## D4 — Optional resolution event boundary (V-08/V-14)

Add module option `resolutionEventPort?: OfflineSyncEventPort`. Its absence
preserves the existing applied-item-only `eventPort` behavior and emits no
resolution event. DETRAN acceptance of resolution events must explicitly bind
this port; local absence is not proof of the consumer requirement.

Every accepted resolver-backed action (including one that leaves the conflict
open) has one persisted action ID. When configured, append exactly one event
using `appendInTransaction` on the same transaction after conflict, action,
receipt and any pending-state writes. Its shape is:

- `entity: 'offline.sync-conflict'`, `entityId: conflictId`;
- `idempotencyKey: 'stynx:offline-sync:resolution:' + actionId`;
- `payload: { actionId, conflictId, queueItemId, action, resultingStatus, actorId, at }`.

`actorId` and `at` are the actual trusted actor/injected instant; IDs come from
persisted action/conflict identity. Do not trust resolver-returned tenant or
identity fields. This append is the final write, respecting outbox transaction
sealing. Any event refusal rolls back every resolution/action/pending change.
A refused/unknown action emits nothing. Existing already-resolved refusal and
manual-review action semantics remain. In-memory storage stages or rolls back
its state consistently with the PostgreSQL boundary. The consumer may map these
events into its existing envelopes; STYNX invents no DETRAN event code.

## D5 — Durable reconciliation history (V-13)

Add optional `ReconcileNumberingInput.idempotencyKey` (1–255 UTF-8 bytes) and
optional `ReconcileNumberingResult.reconciliationId`. Shipped stores populate the
latter for new accepted reconciliations. Add `NumberingReconciliationRecord`:
`{ reconciliationId, tenantId, reservationId, actorId, createdAt, claimedNumbers,
userRef?, idempotencyKey?, result }`. Claims are the numerically sorted unique
set supplied to that operation; `result` is its actual immutable result snapshot.
Actor/time come from trusted context and the injected clock. Missing historical
reconciliations remain missing; never infer them from `updated_at`.

Append one record atomically with each successful reconciliation. Only a
`reserved` reservation may transition available consumption to claimed-locally.
Other existing states may be observed and recorded without reviving consumption,
renumbering or applying a domain effect. An out-of-range claim refuses before
any write. Existing missing/unexpected calculations and expiration projection
remain authoritative for the actual instant.

An optional key is scoped to tenant/reservation. Same key and identical canonical
claim set/userRef returns the original result/ID without another record or
consumption change. Different request under that key refuses 409
`OFFLINE_SYNC_RECONCILIATION_IDEMPOTENCY_CONFLICT`. Without a key each successful
call is a distinct recorded observation, including identical repeated claims.
Concurrent keyed contenders cannot append duplicates. All records are append-only.

Expose `listNumberingReconciliations({ reservationId, limit?, cursor? })`, returning
`OfflineSyncPage<NumberingReconciliationRecord>` under current trusted tenant.
Use the existing validated keyset pagination convention, newest first with stable
ID tie-break; another tenant's records remain invisible. The durable-store seam
is optional for compatibility and refuses `OfflineSyncConfigurationError` when
requested on an unsupported custom store. No new public HTTP route is required.

Forward migration `0009` adds `offline.numbering_reconciliations`, tenant/reservation
foreign keys, exact replay uniqueness and required indexes, ENABLE/FORCE RLS,
app SELECT/INSERT and reader SELECT without UPDATE/DELETE grants. The live storage
verifier and closed digest-bound manifest include the new relation and constraints
under configurable tenant-table/role bindings. An upgrade creates no invented
historical record and preserves existing reservations/consumption/import ledgers.

Extend owner-only import losslessly: retain `stynx-offline-import/1` and its exact
eleven-kind union; add `stynx-offline-import/2` for manifests that may additionally
contain the closed `reconciliations` kind, mapped by `tenant_id,id`. Preserve all
record IDs, actors, timestamps, request keys/claims and result bytes/values; verify
reservation/tenant relationships and replay uniqueness. Old /1 manifests remain
accepted and no existing digest is recomputed. The new import format is additive,
not a permissive unknown-kind escape. Imported reconciliation history causes no
domain effect, claim reapplication or event emission.

## D6 — Bound forward-migration artifacts for consumer storage

DETRAN's populated custom-bound installation exposed an incomplete D6 delivery:
the full fresh artifact is not repeatable, historical migration files name
platform roles and `tenancy.tenants`, and the supported identifier binder was
private. Correct this 1.6.1 offline upgrade gap with an additive pure renderer;
do not rewrite any historical migration or make the fresh artifact repeatable.

Publish `renderOfflineStorageMigrations(options?: OfflineStorageOptions):
OfflineStorageMigrationsArtifact` and these types through the package entrypoint:

```ts
interface OfflineStorageMigration {
  source: { path: string; sha256: string };
  sql: string;
  sqlSha256: string;
}

interface OfflineStorageMigrationsArtifact {
  contractVersion: string;
  packageVersion: string;
  binding: StorageRoleBinding;
  migrations: readonly OfflineStorageMigration[];
}
```

Return every registered offline migration, currently 0001–0009, in canonical
forward order. `source.path` is the same package-relative identity used by the
existing manifest; `source.sha256` is SHA-256 of the exact original migration
file bytes. `sqlSha256` independently hashes UTF-8 bytes of the returned bound
`sql`. Both digest fields are lowercase 64-character hexadecimal strings.
Binding cannot change an original source identity, falsely label transformed
SQL as original bytes or replace an earlier migration receipt.

Generate each migration's ordered classified statement metadata from those same
immutable sources. Preserve statement order within each migration, including
backfills, locks, ownership, grants and policy transitions; do not reconstruct
forward SQL by splitting the full fresh artifact. Apply the existing reviewed
object identifier binder only to object statements and the binding-statement
projection only to binding statements. Keep its explicit legacy PUBLIC-policy
normalization, custom policy names, quoted role/tenant identifiers and optional
reader omission. Reject unsupported future grammar/tokens during generation.
Runtime rendering uses only shipped digest-bound generated inputs: no filesystem,
subprocess, database, ambient checkout, arbitrary SQL template or caller-supplied
migration source. Validate options through the existing closed binding contract.
The existing full fresh renderer's SQL behavior and live verifier stay intact.

The consumer owns selection and execution. Require a previously receipted,
contiguous raw-source prefix with matching source digests and binding identity;
unknown, missing, mismatched or non-prefix history refuses before mutation. A
populated unreceipted installation is not automatically adopted. Before forward
DDL, establish the prior installed contract using its independently pinned
version's read-only verifier, or independently trusted persisted catalog custody
and applicable row-invariant checks for that exact prior prefix and binding.
The latest full-catalog verifier cannot certify an older legitimate schema;
table presence or a migration filename alone is insufficient prior-state proof.
The renderer verifies none of these caller-owned preconditions and supplies no
live-supported verdict, selection inference or migration-ledger implementation.

Apply only the missing suffix in order, under the configured owner's writable
maintenance transaction, exclusive consumer migration coordination and full row
visibility. Record the actual original source identity, binding and bound SQL
digest with the consumer's successful transaction; never record an unapplied
migration or commit a partial chain. No application connection, platform
bootstrap runner, role creation, hidden transaction or implicit privilege
escalation is introduced. Apply the separately repeatable final role bindings,
then independently verify the final exact package/binding in a read-only owner
transaction. A failed migration leaves prior rows/catalog/ledger unchanged when
the owner transaction is rolled back. Repeated consumer upgrade with the same
verified complete ledger executes no historical migration or backfill.

Inspector verifies raw identities and output digests, deterministic generation,
ordered bindings, default/custom/quoted identifiers and null-reader behavior,
installed-package rendering without source access, and real PostgreSQL populated
custom-bound forward upgrades. Include 0001→0009 backfill preservation and
0008→0009 history extension, actual owner/full visibility, restricted direct
login, FORCE RLS and two-tenant negatives. Preserve the existing fresh-artifact
replay refusal/rollback witness. Consumer ledger/prior-state admission remains
DETRAN acceptance evidence; STYNX fixtures alone cannot establish its completion.

## Acceptance

Inspector probes both real stores for each named gap, preserving every existing
assertion. Required negative witnesses include tenant/actor spoofing, unsafe
context, replay drift, event failure atomicity, keyed reconciliation races,
post-close no-revival, forward populated upgrade, restricted-role FORCE RLS and
lossless /1-/2 import. Architect rebinds intended emitted API and assertion trace
after implementation/testing. Publication and issue closure require actual
installed-package and DETRAN acceptance evidence, not this decision alone.
