---
adr_id: ADR-MOBILE-OFFLINE-0004
title: Durable initial state, pre-apply evidence, numbering administration and verified import
status: accepted
date: 2026-10-10
authors: ['Architect']
tags: [stynx, offline-sync, mobile, numbering, integrity, import, tenancy, minor]
supersedes: ADR-MOBILE-OFFLINE-0003 D1.2 initial received-only rule, D5 deferred minor decisions and D6.4 import prohibition only
---

# ADR-MOBILE-OFFLINE-0004 — Durable parity and verified import

## Status

Accepted for the Owner-authorized complete STYNX 1.6.0 minor and DETRAN
adoption campaign. This resolves the named minor-release gaps in
[ADR-MOBILE-OFFLINE-0003](ADR-MOBILE-OFFLINE-0003-queue-states-and-consumer-storage.md).
All unamended decisions remain binding, including canonical stored hash checks,
trusted tenant/actor identity, independent item transactions, dynamic resolution
actions, immutable history, numbering non-reuse and exact closed-batch replay.
E6 compatibility remains separate from CTG9 durable mode. This record does not
declare implementation or provider acceptance complete.

## Decision

### D1 — Opt-in initial pending materialization

Add module option `initialQueueStatus?: 'received' | 'pending'`, default
`received`. It applies only to newly materialized CTG9 queue items and receipts;
it does not alter existing rows or E6. Selecting `pending` changes the initial
vocabulary, not the execution protocol: the same batch still executes its item
transaction and closes with its actual results. No worker, implicit delayed
application, read-triggered effect or new replay path is introduced.

The selected mode is bound to durable batch context so a resumed batch cannot
silently change its initial-state semantics. Existing batches without this field
keep their original context/fingerprint and received semantics; their closed
responses are never re-fingerprinted or invalidated by the new module option.
Forward migration `0005_initial_queue_status.sql` persists the selected mode on
`offline.sync_batches.initial_queue_status`, non-null with default `received`
and a closed `received`/`pending` constraint. Capture it only on first batch
creation; the stored mode governs resume, lease takeover and contested creation,
even under a different module option. Do not change existing item/receipt states.
Correction-origin pending items
retain the existing later-batch/same-device/same-key/same-hash rule and effect
preconditions. Initial materialization is not permission to reapply an already
applied item. Exact closed-batch response bytes and headers remain authoritative.

An initially pending item may use the existing later-batch admission rule: the
same trusted tenant/device, identical key/hash and a different durable batch ID.
No correction-origin discriminator is required. Preserve the original item,
receipt and batch binding and serialize on the receipt so the original open
batch and a later contender cannot both commit an effect. This does not relax
the correction transition's unapplied/no-other-open-conflict predicates or any
integrity/numbering admission check. A closed batch replay still applies nothing.

### D2 — Pre-apply detection and stable item context

Add an optional `preApplyDetector` port. Its `detect(trx,item,context)` returns
the typed suspicion/pair evidence of `OfflineSyncConcurrencyResult` before
numbering consumption, domain application or final event append. It executes
on the same strict, tenant/actor-scoped item transaction and may read, but does
not produce domain writes or acquire a second connection. It cannot use another
tenant or substitute a request-supplied scope.

The applier receives the stable `receiptId` and the effective detection result
in additive context fields, including `concurrencySuspected` and
`concurrentPairs`. Pair identities are validated within the trusted tenant;
malformed evidence is refused before effects. An existing post-apply detector
retains its ordering and meaning; a clean pre-apply result does not waive a
later suspicion. The effective result preserves all real evidence and does
not invent a pair, actor, server entity or application instant.

When policy or the configured host decision forbids applying a suspected item,
persist the conflict, receipt and evidence atomically without numbering/domain
effects or an application event. When policy permits application, the applier
sees the effective suspicion and real pair evidence, and existing atomicity,
final event and read-only sealing rules remain. The choice is host policy,
not a request-body flag. Failure rolls back the whole item boundary.

The exact trusted policy field is
`OfflineSyncPolicy.concurrencyApplication?: 'apply' | 'defer'`, default `defer`
for effective pre-apply suspicion. Pair identities and their relationship to the
current item are validated before consulting `handoffPort.permits`; verified
handoff exemptions are reflected in the effective pairs and suspicion supplied
to the applier. `apply` waives no tenant, hash, numbering or other admission
requirement and retains genuine conflict evidence. `defer` records no
`appliedAt`; correction retry remains subject to the existing unapplied-conflict
predicates. Without a pre-apply detector, this field changes no legacy behavior.
It does not disable or reorder the existing post-apply detector/window. Invalid
policy values are refused rather than interpreted as permission to apply.

Expose additive typed context signals in receipts/listings/conflict evidence
only when the corresponding path produced them. Continue the existing reserved
`stynx` versioned context and 4096-byte opaque consumer-attributes bound; do not
reconstruct fields for historical rows or merge platform fields into the
published consumer `context`. Replays use original stored values.

### D3 — Independent canonical payload hashing

Add a typed `payloadHashPort` whose `hash(item,context)` computes the canonical
digest from effect-bearing item content independently of `item.payloadHash`.
The default computes SHA-256 over deterministic canonical JSON of `payloadJson`
and publishes the same pure helper for producers. The format remains exactly
`sha256:` plus 64 lowercase hexadecimal characters. JSON object order does not
change the digest; array order and value changes do. Non-JSON values and
ambiguous serialization are refused, rather than dropped or stringified away.

Publish `canonicalOfflineSyncPayload(payloadJson)` for the canonical text and
`canonicalOfflineSyncPayloadHash(payloadJson)` for its UTF-8 SHA-256 digest.
The root is a plain JSON object (ordinary or null prototype). Recursively sort
object keys by UTF-16 code-unit order; use JSON string/finite-number encoding,
including `-0` as `0`, and preserve array order. Strings and keys require valid
Unicode. Admit only JSON values: reject cycles, accessors, symbols, non-finite
numbers, sparse arrays, extra array properties, non-enumerable object fields,
non-plain objects and unsupported values instead of invoking coercion or `toJSON`.
These payload rules are distinct from the historical batch fingerprint encoder;
do not change that encoder or rewrite its stored hashes.

An explicitly configured port may implement a documented consumer canonical
payload format. It receives trusted context, not authority to waive verification.
STYNX independently validates the returned digest and compares it to the
submitted canonical digest before any effect. A malformed returned digest is a
typed port/configuration error; a different submitted digest is the existing
per-item integrity rejection. A port cannot turn a noncanonical submitted hash
into accepted item data. The independent batch content fingerprint and stored
key/hash consistency checks remain mandatory.

The original item/receipt/effect never changes on same-key mismatch. Raw received
hash evidence and original-key conflict rules of D3/D4 in ADR-0003 stay intact.
New-key mismatch consumes no key, number or effect. Closed-batch replay remains
byte-exact and does not rerun the hash port. Declare this new content-integrity
check in the 1.6.0 upgrade guide; a valid-looking arbitrary digest is no longer
enough to apply a CTG9 payload. E6 remains unchanged.

Expose `getSyncIntegrityRejection(identity: SyncIntegrityRejectionIdentity)` on
the service, returning `Promise<SyncIntegrityRejection>`. The identity is the
existing attempt address `{ deviceId, deviceBatchId, queueItemId }`, scoped by
the trusted current tenant, not a fabricated UUID or canonical queue identity.
The record includes that address, `tenantId`, `idempotencyKey`, the submitted
`receivedPayloadHash` verbatim, actual `rejectedAt` and fixed
`errorCode: 'OFFLINE_SYNC_ITEM_INTEGRITY'`. `storedPayloadHash` and
`originalQueueItemId` appear only when the original stored evidence supplies
them. A new-key rejection remains readable without a canonical queue row or
invented canonical hash. Preserve the original attempt instant on repeated reads.
No read applies effects or creates evidence. Missing/other-tenant attempts return
service error `OFFLINE_SYNC_INTEGRITY_REJECTION_NOT_FOUND` (404); the store port
returns null. Both shipped stores implement the additive optional durable-store
port; a custom store without it refuses with
`OfflineSyncConfigurationError('getSyncIntegrityRejection')`. This introduces
no HTTP route or separate evidence table.

### D4 — Nullable shifts and mandatory single active durable reservation

CTG9 reservation inputs and outputs admit `shiftId: string | null`; the field
remains structurally required. A forward migration makes the storage column
nullable. Null is a real no-shift value, matched with null-safe SQL and included
explicitly in reservation fingerprints. Preserve all stored string values,
including `OFFLINE_SYNC_NO_SHIFT`, and all historical replay fingerprints.
The existing sentinel remains accepted for compatibility; for active-reservation
admission only, sentinel and null represent the same no-shift scope.

CTG9 enforces **one active reservation per tenant, device and shift scope**,
including no-shift. This is mandatory, not an optional weakening. `reserved`
and `blocked` reservations with unexpired validity occupy that scope; a terminal
or expired reservation does not. Existing active rows participate. Serialize
admission in the database before checking and allocating, so concurrent calls
on different connections cannot both succeed. Same-key same-request replay
returns the existing reservation before new-allocation refusal and consumes no
numbers. A second distinct active request fails with
`OFFLINE_SYNC_ACTIVE_RESERVATION` (409), leaving ranges and reservations intact.
An expiration transition cannot reissue already assigned/applied numbers.

The upgrade checks existing active duplicates and reports their tenant/device/
shift identities. It never silently cancels, merges, deletes or renumbers them.
Resolve such data through authorized lifecycle operations before enabling the
new constraint. The default E6 behavior and string-valued E6 output stay intact;
CTG9 has explicit widened types rather than an unsafe cast of null into E6.

The exact widened input is
`CTG9ReserveNumberingInput extends Omit<ReserveNumberingInput, 'shiftId'>`
with required `shiftId: string | null`.
`CTG9NumberingReservation` omits both `status` and `shiftId` from the E6 result
and supplies the durable status union and required nullable shift. Add service
methods `reserveDurableNumbering(input): Promise<CTG9NumberingReservation>`,
`replayDurableNumberingReservation(input): Promise<CTG9NumberingReservation | null>`
and `cancelDurableNumberingReservation(id,input): Promise<CTG9NumberingReservation>`.
Their durable-store ports take trusted scope first; reserve additionally takes
the injected current instant/default expiry, and cancel takes the current
instant. Custom-store ports are additive optional seams and fail configuration
when an unsupported operation is requested. CTG9 controller paths use these
durable methods; the E6 methods and their string-only types remain unchanged.

Forward migration `0006` makes `shift_id` nullable and adds a non-null closed
`reservation_origin` discriminator (`e6` or `ctg9`), default `e6` for existing
rows. New durable reservations write `ctg9`; E6 writes `e6`. A database guard
serializes the tenant/device/normalized-shift scope and samples live expiry
after acquiring its lock. For active admission or a transition back into active
scope, a CTG9 row conflicts with any active row of either origin; an E6 row
conflicts with active CTG9 rows. Pure E6 multiple-reservation behavior remains.
Guard insertion and relevant updates, including extension of validity; owner
transfers cannot bypass verification. Do not use a time-dependent partial unique
index as a substitute for live, serialized expiry checks. A refusal rolls back
allocation and every new row.

Durable same-key replay may return a historical `e6`-origin string row, since
historical CTG9 and E6 rows are not distinguishable by that new discriminator.
Answer exact replay before policy/expiry/active checks. Sentinel and null are
equivalent only in the active-scope comparator/lock key: never normalize stored
values or fingerprints. Null has its own explicit new fingerprint; reusing a
sentinel-bound key with null is conflicting reuse. Legacy E6 mapping refuses
null or `blocked` results before mutation rather than widening its output or
casting it. The active-admission refusal is `OfflineSyncError`, code
`OFFLINE_SYNC_ACTIVE_RESERVATION`, status 409, `retryable: false`, message
"An active numbering reservation already exists for this device and shift."

### D5 — Tenant range administration and reconciliation

Add typed service/store operations to create, get, list and cancel numbering
ranges: `createNumberingRange`, `getNumberingRange`, `listNumberingRanges`,
`cancelNumberingRange`. They use trusted tenant/actor context and consumer-owned
permission enforcement, no identity override input. Creation validates safe
integer bounds, `startNumber <= endNumber`, and sets `nextNumber=startNumber`.
Keep the existing tenant/org-unit/entity-type/series uniqueness. An optional
tenant-scoped operation key binds the full creation request for idempotent
repetition; conflicting reuse refuses without allocation.

Ranges gain optional opaque `consumerAttributes`, using the existing bounded
JSON object contract, stored/returned without product interpretation. Existing
rows have no fabricated attributes. Allocation boundaries and scope are
immutable after a reservation references the range; consumers cannot write
`nextNumber`, mark a range exhausted, or reactivate a cancelled range. Cancellation
uses the same range row lock as reservation, and only transitions active to
cancelled; it cannot undo consumption or erase history. List/read operations
are read-only with deterministic keyset order and bounded pages.

Reconciliation continues to report actual available/claimed/applied/blocked/
expired consumption and missing/unexpected server numbers. Add typed context
and opaque attributes only from actual stored consumer evidence. It must
distinguish a claim from an applied domain effect, preserve actor/reason/history,
and never infer successful application merely from an assigned number.
Reserve/reconcile/settle races, null shifts and imported reservations preserve
the non-overlap and no-reissue invariants in both stores.

### D6 — Closed consumer storage and owner-only verified import

Deliver the ADR-0003 D6 closed storage manifest and read-only live verifier for
the installed package version. Structure includes every runtime SQL dependency,
new column/constraint/index and history table, named owner/application/optional
reader roles and tenant table. Default and nondefault bindings receive the same
FORCE RLS, policy, least-grant, ownership and membership checks. Reports identify
contract/package/binding, each object/check and affected tenant; unknown or
unreadable mandatory checks refuse supported-mode status. No verifier repairs
data, changes grants or claims the consumer's audit implementation is verified.

The 1.5.x prohibition on a STYNX offline import port is superseded for 1.6.0.
Provide an explicit owner-only import seam accepting a validated manifest with
source-system identity, source digest, source-to-target identity mappings,
tenant-preserving records and optional independently verified archived batch
response evidence. It is not mounted on a request controller and cannot be
invoked through an application-role transaction. It requires an exclusive
maintenance boundary with ordinary writers stopped and the same closed storage
verification; the consumer's mapping and source collection remain consumer-owned.

Import is atomic and idempotent by source identity/digest. Changed content under
the same source identity refuses rather than replacing prior data. Preserve
source tenant, key identity, canonical stored hashes, state and real original
instants. Preserve applied numbers and advance range/reservation counters so no
number can be reissued. Import never calls an applier, dispatcher or provider.
Actual legacy evidence is mapped durably; missing context/history stays absent.
An applied record cannot be downgraded to an unapplied state.

A batch with no independently verified original response remains
`legacy_closed_unverified`; it never replays invented response bytes. Verified
archived bytes/headers bind to the exact batch and mapping before replay becomes
possible. A failed invariant, tenant mismatch, ambiguous mapping or unsupported
source format aborts without partial state transfer. After import, the live
verifier and real consumer protocol tests must pass before writes resume.

## Migration and compatibility

Use forward offline migrations after `0004`; preserve `0001`–`0004`, legacy
rows, receipt bytes and every historical observation. Update canonical DDL,
seeds and the closed manifests from the same migration sources. Runtime fails
typed upgrade-required against an older schema. Nullable CTG9 outputs, new
content-integrity enforcement and active-reservation refusal are declared minor
upgrade changes. Existing HTTP methods/paths/envelopes and E6 behavior remain
unless a separately accepted endpoint contract explicitly adds an operation.

## Verification obligations

Inspector independently covers both stores and real PostgreSQL under restricted
roles with two tenants: initial-state opt-in/default and crash resume; detector
ordering/rollback/context; canonical hash ordering/mismatch/invalid-port refusal;
null/sentinel replay and concurrent single-active allocation; range bounds,
immutability/attributes/permissions; reconciliation/settlement races; complete
and incomplete legacy imports, changed source digest, cross-tenant mappings,
atomic rollback and exact archived replay. Existing assertions and ordinary
thresholds remain. Provider compatibility is separately demonstrated in DETRAN;
local mocks cannot substitute for it.
