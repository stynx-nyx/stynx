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

### D1.1 — Optional consumer domain-outcome classification

The 2026-10-13 DETRAN comparison identified a remaining V-04 state-mapping gap:
context preservation alone does not retain consumer business outcomes. The
existing `OfflineSyncNumberingOutcome` is reserved for its closed platform
numbering codes. Consumers must not forge those codes, return an applied result
for a failed effect or relabel a durable rejection only in an HTTP response.
This correction remains within the approved 1.6.1 offline acceptance scope.

Add optional module option
`domainOutcomeClassifier?: OfflineSyncDomainOutcomeClassifier`, with these
additive public types. `OfflineSyncDurableStore` also adds readonly optional
`supportsDomainOutcomeClassifier?: true`. Both shipped stores expose literal
`true`; a custom store may opt in only after implementing this complete contract.
A configured classifier requires CTG9 `policyResolver` and that exact capability.
`OfflineSyncService.submitSyncBatch` refuses `OfflineSyncConfigurationError`
for `domainOutcomeClassifier` before either legacy or durable submission when
one is absent. With no classifier, existing custom stores and E6 remain unchanged.
The capability declares supported behavior; it supplies no acceptance evidence.

The classifier types are:

```ts
interface OfflineSyncDomainFailure {
  readonly code: string;
  readonly httpStatus?: number;
  readonly context?: Readonly<Record<string, unknown>>;
}
interface OfflineSyncDomainOutcome {
  readonly status: 'received' | 'rejected' | 'conflict';
  readonly conflict?: {
    readonly type: 'domain' | 'concurrency';
    readonly description: string;
  };
}
interface OfflineSyncDomainOutcomeClassifier {
  classify(
    failure: OfflineSyncDomainFailure,
    item: CTG9SyncBatchItemInput,
    context: OfflineSyncItemContext,
  ): OfflineSyncDomainOutcome | undefined;
}
```

This is a synchronous, deterministic consumer-owned classification boundary,
not an execution port: pass no transaction, write callback or raw exception.
Invoke it only after the failed item transaction has fully rolled back, with
detached item/context data and the actual trusted scope, effective business agent
and stable receipt identity. The failure carries the original nonblank own-data
string `code` (at most 255 UTF-8 bytes), HTTP status only for an actual
`HttpException`, and the already validated/detached D1 context. Never infer a code
from a message or accept request-body tenant/actor replacements.

Platform errors are ineligible: configuration, upgrade, integrity, sequence,
replay/lease, numbering and other `OfflineSyncError` failures retain their exact
existing behavior; codes beginning `OFFLINE_SYNC` are reserved independently of
the error class. Invalid domain context is handled before this classifier and
retains `OFFLINE_SYNC_DOMAIN_CONTEXT_INVALID`. Uncoded or malformed-code failures,
an absent classifier, or an `undefined` result preserve the existing fallback:
classified nonplatform HTTP 4xx rejection or retryable initial/pending state.
No consumer-specific code table is shipped in STYNX.

A supplied outcome is a terminal observation for this attempt: persist its
exact status and original code/context to canonical queue, receipt and applicable
attempt records in the normal separate refusal transaction. It commits no domain
effect, numbering consumption or applied-item event and contains no fabricated
application time/entity. A `received` outcome cannot request a conflict; it
closes the batch when all other items are terminal. Add optional platform field
`OfflineSyncStynxContext.terminalReceived?: true`, produced only for this newly
classified received outcome together with `retryable: false`. Same-key/hash
submissions, including another batch, return that original receipt without
reapplication or reopening its batch. Marker absence preserves old received and
pending retry semantics; historical responses and receipts are not rewritten.

The existing `offline-import.schema.json` already admits legal JSON objects in
receipt/attempt `context_json` through `$defs/object`; it has no closed `stynx`
member definition to widen. Preserve that historical schema and its record/kind
closures. Owner-only import must preserve an actually recorded terminal marker,
never infer or invent it for old received rows. Inspector must exercise its
lossless import round-trip, valid `true`/received/nonretryable relationship and
refusal of contradictory newly asserted marker evidence.

For `rejected` or `conflict`, an optional descriptor opens one tenant-scoped
canonical conflict and its evidence in that same refusal transaction, using
platform-generated conflict ID, trusted queue/local/hash identity and actual
clock. `description` is a nonblank legal string of at most 4000 UTF-8 bytes.
Only domain/concurrency types are admitted; integrity remains exclusively the
platform hash-verification path. Status `conflict` without a descriptor is
permitted: a consumer may record a business collision without opening a supervisor
case. A returned descriptor never supplies tenant, actor, IDs, allowed actions,
hashes or application provenance.

Use existing `conflictResolver.allowedActions` with the same trusted item context;
without that hook retain domain defaults `reject`/`retry_after_correction` and
concurrency default `manual_review`. Preserve the existing resolver/action
validation and resolution-event behavior. Keep consumer receipt context untouched;
conflict identity/actions are available through the existing canonical conflict
and action reads. Store original consumer context as a distinct nested `context`
member in the new conflict evidence, alongside platform code/instant/context;
never overwrite a consumer field named `conflictId`, `allowedActions` or `stynx`.
The last remains invalid under D1, rather than a classifier escape.

Validate the closed outcome shape without coercion, accessors, unknown fields or
thenables. A thrown classifier or invalid result becomes retryable
`OFFLINE_SYNC_DOMAIN_OUTCOME_INVALID` after rollback, preserving initial/pending
state and an open batch. A failure while persisting conflict/receipt evidence
rolls back that complete refusal transaction and cannot commit a partial conflict
or report a closed success. Classification is not rerun for stored duplicates or
closed replay. Shipped memory/PostgreSQL stores must agree; custom stores may not
silently claim support while ignoring a configured classifier.

Inspector acceptance must prove default compatibility, all three terminal states
and both optional conflict types, unknown-code fallback, non-HTTP typed business
errors, reserved/platform refusals, invalid context/result/async/throwing cases,
original consumer context and identity, actual effect rollback, refusal-write
atomicity, terminal received cross-batch duplicate/replay, pending reapplication,
tenant isolation and both-store parity. Keep all existing assertions. DETRAN owns
its code/outcome table and independent mapping/characterization proof against the
installed published package; this contract supplies neither that proof nor
permission to change DETRAN's public protocol.

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

### D4.1 — Process-local transaction ownership and rollback isolation

Actual release coverage review exposed a real isolation gap in the memory
store: an item rollback restores tenant-wide queue/conflict snapshots while
unrelated public E6 submit, open-conflict and resolution calls can mutate those
maps outside the durable-batch gate. Such a rollback must not erase another
public operation. Nor may a detached resolver recreate queue/conflict/action
facts after its owning item rolled back. This repairs the existing atomicity
obligation; it grants no new public API or consumer outcome.

Use a private per-store asynchronous ownership context and the existing
same-tenant mutation gate. Serialize every public operation that mutates the
snapshotted queue/conflict projections: E6 `submitSyncBatch`, `openConflict`,
legacy `resolveConflict`, resolver-backed `resolveWithPort` and the durable
batch execution. An unrelated caller waits until the current owner releases
the gate, then validates and writes against the committed/restored state.
Different tenants remain independent. Do not change same-batch replay,
in-progress lease behavior, transport identity or request admission.

Active, same-store/same-tenant operations invoked inside a transaction port
inherit its ownership and reenter without awaiting their own gate. This keeps
legitimate nested E6 effects part of the failing applier's sandbox transaction.
Track the lifetime of the owned item/resolution frame separately from the batch
owner. Close a frame before restoring its snapshot and after its boundary ends.
After any awaited port, validate that frame before changing queue, receipt,
conflict/evidence or action state. A detached callback whose frame has closed
must not reacquire ownership or write stale state into a later transaction.
After a successful awaited result, validate ownership before invoking the next
domain port as well as before writing. In particular, late `allowedActions`
completion on a closed frame must refuse before `resolve` is invoked. Preserve
the original refusal of a callback already entered before closure; do not start
a new callback on a closed frame merely to obtain a subsequent refusal.
Preserve an actual callback refusal; when a callback returns successfully after
closure, refuse through the existing typed conflict/batch error family before
any write. Closed-frame cleanup must not restore stale local snapshots over
another owner's state. Preserve the genuine conditional rollback behavior;
do not replace it with unconditional restoration of pre-await records.

Track active owned child frames before their first await and remove them only
when settled. A frame whose body returns successfully cannot commit or return
success while an owned child remains active: refuse through the existing typed
conflict/batch family and perform its normal owned projection rollback. Do not
wait indefinitely for detached work or change any deadline. If the body itself
fails, preserve that actual error instead of replacing it with a child-lifetime
error, and close the frame before rollback. In particular, a fire-and-forget
resolver paused in `resolutionEventPort` cannot leave its earlier queue/conflict/
action changes committed when the parent applier returns. After parent rollback,
the child must refuse stale success and cannot restore its obsolete snapshot.
Keep event append as the final write required by D4; moving store writes after
an awaited event is not an alternative to ownership completion.

Avoid self-deadlock: same-conflict recursive resolution and nested durable-batch
entry cannot wait on a lock/promise held by their own frame; refuse them through
existing typed conflict/in-progress errors. An owned callback cannot acquire
another tenant's mutation context; refuse that scope mismatch rather than
broadening the transaction's tenant. Unrelated other-tenant requests remain
admitted normally. No public transaction token or reentrancy option is added.

Rollback restores all owned queue/conflict projection facts consistently,
including their E6 item/payload indexes and action history; stale indexes or
orphaned history cannot survive removal of their owning failed effects. Existing
historical facts remain untouched. PostgreSQL retains its real transaction/row
lock implementation; memory must preserve the same ownership principle, without
pretending that process-local gates are PostgreSQL isolation evidence.

Inspector acceptance uses only public APIs and real asynchronous barriers:
an unrelated same-tenant E6 queue/conflict survives a paused CTG9 item's failure;
its later resolution succeeds against canonical state; nested own effects still
roll back, including replay/index/history observations; a detached successful
resolver after parent rollback refuses without resurrection. Retain the existing
nested resolver-refusal witness and prove other-tenant progress, self-deadlock
refusals and ordinary replay/rollback behavior. No private-map tampering,
coverage exclusion, threshold reduction or fault-disguising rename is allowed.
Also prove that a parent whose applier returns successfully while an owned
resolver event remains pending refuses and rolls back those partial facts;
releasing the event afterward neither resurrects them nor reports stale success.
For the new unpublished nested-refusal witness, place its pause inside the
already-entered resolver rather than before resolver admission; retain every
original error-identity and state assertion. Independently cover late
`allowedActions` completion with `resolve` not called, typed refusal and no
queue/conflict/action resurrection. This fixture setup correction strengthens
callback lifetime admission and authorizes no assertion removal or weakening.

#### D4.1 refinement — independent resolution progress

The unchanged V-08 witness requires a second conflict of the same tenant to
resolve while a first conflict waits in its final event callback. A blanket
tenant mutex contradicts that valid behavior. This prospective refinement
supersedes only the blanket serialization and shared-frame snapshot restoration
above; ownership, closed-frame fences, child completion and all existing tests
remain required.

Use an exclusive/shared tenant admission boundary. Durable CTG9 execution owns
exclusive admission and waits for active independent projection operations;
external E6 submit/open-conflict/legacy and resolver-backed resolutions use
shared admission. Once exclusive work is queued, do not admit later independent
shared owners ahead of it indefinitely. Owned nested calls inherit their active
permit without self-waiting; nested durable batches and cross-tenant ownership
still refuse. Other tenants remain independent. Restore resolution serialization
for the same canonical queue item (therefore also the same conflict), with
same-owner recursive/overlapping acquisition refused before self-wait. Different
queue-item conflicts retain independent progress. No deadline or public API is
changed.
An owned nested acquisition that would wait on another owner's queue lock must
also refuse before waiting, avoiding cycles between reentrant domain ports.
Independent external contenders may wait normally on that queue's lock.

A shared operation cannot restore an entire tenant snapshot. Use private owned
write journals for the queue/conflict projections and their associated maps,
including E6/payload indexes, receipt/batch associations, conflict metadata,
integrity facts and action history. Before each map mutation, record its actual
prior presence/value and resulting value under the active frame. Claim the
map-identity/key before writing: another independent owner or an active
non-ancestor sibling frame cannot mutate that claimed key; refuse through the
existing typed conflict family before writing rather than waiting while holding
other keys. Descendant writes may inherit an ancestor claim. This prevents
overlapping owners from committing from another operation's uncommitted facts.

Apply the same foreign-claim admission check to mutation-relevant reads and
early acknowledgements. An E6 duplicate fast path cannot acknowledge a queue
identity reached through another owner's uncommitted payload/E6/queue index.
Refuse through the existing typed conflict family before acknowledgement; after
the owner rolls back, an independent retry can materialize its own valid item.
Claim the canonical queue before resolution callbacks, not only at the later
state write. Public read-only diagnostic methods gain no new isolation promise.

On child success, merge its undo custody into the parent: retain the earliest
prior value, advance the last-owned-write identity and transfer claims. On
failure, close the affected frame and descendants first, then undo their owned
writes in reverse order, validating current write custody before restoration.
Restore/delete only keys actually written by those frames; never replace a
foreign committed value or scan-delete unrelated tenant entries. Remove only
owned action IDs and retain the monotonic action-sequence counter. Root success
releases its claims without undo. A closed detached child's cleanup cannot
replay an obsolete journal. Full tenant snapshots may remain only inside
exclusive CTG9 execution, where independent writers cannot coexist.

A failed shared root operation undoes its entire owned journal, including an
earlier partial multi-item E6 prefix, while retaining the actual rejection.
Successful roots check child completion before releasing claims. Preserve the
existing CTG9 **per-item** transaction boundary: after an item completes, its
projection journal becomes committed baseline before the next item begins.
A later fatal item or batch failure must not undo earlier completed item
receipts/projections while their consumption/domain/event effects remain
committed. Roll back only the failed or unfinished item and its descendants;
do not silently introduce whole-batch atomicity. The exclusive admission permit
may remain held across the batch without retaining completed items as undoable
ancestor writes.

Inspector must retain the unchanged independent-resolution and terminal-contender
witness, prove unrelated successful shared writes survive a failing resolution,
and retain the nested own-effect/index/history rollback and detached-callback
refusals. Tests, coverage thresholds and event-final-write ordering remain
unchanged; this is the bounded correction for verified isolation and progress
defects, not a new concurrency feature or a waiver.
Also cover failed shared E6 prefixes, foreign same-hash duplicate acknowledgement
refusal and independent retry, and a two-item CTG9 batch whose first committed
receipt/effect survives a fatal later item with no repeated effect on replay.

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
